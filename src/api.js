const crypto = require("node:crypto");
const bcrypt = require("bcryptjs");
const {
  json, fail, issueCsrf, validateCsrf, readJson, readBuffer, text, email, password, safeUser,
  currentUser, startSession, endSession, activity, requireUser, randomToken, digest, clearCookie, SESSION_COOKIE, expiryDate
} = require("./security");

const freeDelivery = 3500;
const deliveryFee = 120;
const validStatuses = new Set(["to_pack", "processing", "ready_to_ship", "out_for_delivery", "completed", "cancelled"]);
const transitions = {
  to_pack: ["processing", "cancelled"], processing: ["ready_to_ship", "cancelled"],
  ready_to_ship: ["out_for_delivery", "completed"], out_for_delivery: ["completed", "cancelled"],
  completed: [], cancelled: []
};
const statusLabels = { to_pack: "To pack", processing: "Processing", ready_to_ship: "Ready to ship", out_for_delivery: "Out for delivery", completed: "Completed", cancelled: "Cancelled" };
// Third-party logistics partners a customer can choose from. Edit this list to add or remove couriers.
const logisticsProviders = [
  { id: "jnt", name: "J&T Express" }, { id: "lbc", name: "LBC Express" }, { id: "flash", name: "Flash Express" },
  { id: "ninjavan", name: "Ninja Van" }, { id: "lalamove", name: "Lalamove" }
];
const logisticsName = (id) => logisticsProviders.find((item) => item.id === id)?.name || "";
// Automatic penalty: a cash-on-delivery order cancelled while out for delivery suspends the customer's account.
const AUTO_SUSPENSION_MONTHS = 3;
const CUSTOMER_CANCELLABLE = ["to_pack", "processing", "ready_to_ship", "out_for_delivery"];
const timingHash = bcrypt.hashSync(crypto.randomBytes(24).toString("hex"), 12);

function parsed(value) {
  if (Array.isArray(value)) return value;
  if (typeof value !== "string") return [];
  try { return JSON.parse(value); } catch { return []; }
}

async function assignInquiryStaff(pool, productId, signedIn) {
  if (productId) {
    const [productRows] = await pool.execute(
      `SELECT u.id,u.full_name name FROM products p JOIN users u ON u.id=p.seller_id
       WHERE p.id=? AND p.active=1 AND u.active=1 LIMIT 1`, [productId]
    );
    if (productRows[0]) return productRows[0];
  }
  if (!productId && signedIn?.account_type === "seller") return { id: signedIn.id, name: signedIn.full_name };
  const [sellerRows] = await pool.execute(
    `SELECT u.id,u.full_name name FROM users u WHERE u.account_type='seller' AND u.active=1
     ORDER BY (SELECT COUNT(*) FROM inquiries i WHERE i.seller_id=u.id AND i.status<>'resolved'),u.id LIMIT 1`
  );
  if (sellerRows[0]) return sellerRows[0];
  const [ownerRows] = await pool.execute("SELECT id,full_name name FROM users WHERE account_type='owner' AND active=1 ORDER BY id LIMIT 1");
  return ownerRows[0] || null;
}

async function activeCustomerSuspension(pool, address) {
  const [rows] = await pool.execute(
    `SELECT ca.suspended_until suspensionUntil,ca.permanent
     FROM users u JOIN customer_account_suspensions ca ON ca.user_id=u.id
     WHERE u.email=? AND u.account_type='customer'
       AND (ca.permanent=1 OR ca.suspended_until IS NULL OR ca.suspended_until>now()) LIMIT 1`,
    [address]
  );
  return rows[0] || null;
}

function publicName(fullName) {
  const parts = String(fullName || "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "Customer";
  return parts.length > 1 ? `${parts[0]} ${parts[parts.length - 1][0].toUpperCase()}.` : parts[0];
}

function imageKind(buffer) {
  if (buffer.length > 12 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return "image/jpeg";
  if (buffer.length > 12 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (buffer.length > 12 && buffer.subarray(0, 4).toString("latin1") === "RIFF" && buffer.subarray(8, 12).toString("latin1") === "WEBP") return "image/webp";
  return null;
}

function productInput(body, stockDefault) {
  const name = text(body.name, 160, "Product name");
  const sku = text(body.sku, 64, "SKU").toUpperCase();
  const category = text(body.category, 48, "Category");
  const color = text(body.color, 64, "Color");
  const description = text(body.description || "", 4000, "Description", false);
  const image = text(body.image || "/assets/jacoh-mark.svg", 500, "Image", false);
  const price = Number(body.price);
  const stock = body.stock === undefined ? stockDefault : Number(body.stock);
  const sizes = Array.isArray(body.sizes) ? body.sizes.map((item) => text(item, 24, "Size")) : [];
  if (Array.isArray(body.colors) && body.colors.some((item) => !item || typeof item !== "object" || Array.isArray(item))) throw Object.assign(new Error("Each color option must be a valid color entry."), { statusCode: 400 });
  const colors = Array.isArray(body.colors) ? body.colors.map((item) => ({ name: text(item.name, 64, "Color"), hex: /^#[0-9a-f]{6}$/i.test(item.hex) ? item.hex : "#d9ff3f" })) : [];
  if (!Number.isInteger(price) || price < 1 || price > 10000000) throw Object.assign(new Error("Enter a valid price in pesos."), { statusCode: 400 });
  if (!Number.isInteger(stock) || stock < 0 || stock > 100000) throw Object.assign(new Error("Enter a valid stock count."), { statusCode: 400 });
  if (!sizes.length || sizes.length > 12 || !colors.length || colors.length > 12) throw Object.assign(new Error("Add at least one size and one color."), { statusCode: 400 });
  const safeLocalImage = (/^\/(?:assets|manus-storage)\/[a-z0-9._/-]+$/i.test(image) && !image.split("/").includes("..")) || /^\/api\/uploads\/[a-f0-9]{32}$/.test(image);
  if ((!safeLocalImage && !/^https:\/\//i.test(image)) || image.startsWith("//") || /^(javascript|data):/i.test(image)) throw Object.assign(new Error("Use a managed image path or an HTTPS image URL."), { statusCode: 400 });
  return { name, sku, category, color, description, image, price, stock, sizes, colors };
}

// Owner and all staff (seller) accounts work as one team and see the same store data.
const sharesStoreData = (user) => user.account_type === "owner" || user.account_type === "seller";

function addMonthsUTC(date, months) {
  const result = new Date(date.getTime()); const day = result.getUTCDate();
  result.setUTCDate(1); result.setUTCMonth(result.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0)).getUTCDate();
  result.setUTCDate(Math.min(day, lastDay));
  return result;
}

// Suspends the customer who owns `orderId` for AUTO_SUSPENSION_MONTHS. Runs on a transaction connection.
// Never shortens an existing longer or permanent suspension. Guest checkouts (no account) cannot be suspended.
async function applyAutoSuspension(db, orderId, actorId) {
  const [orderRows] = await db.execute("SELECT c.user_id,c.email FROM orders o JOIN customers c ON c.id=o.customer_id WHERE o.id=? LIMIT 1", [orderId]);
  const row = orderRows[0];
  if (!row) return { applied: false, reason: "customer_not_found" };
  let userId = row.user_id ? Number(row.user_id) : null;
  if (!userId) {
    const [accounts] = await db.execute("SELECT id FROM users WHERE email=? AND account_type='customer' LIMIT 1", [row.email]);
    userId = accounts[0] ? Number(accounts[0].id) : null;
  }
  if (!userId) return { applied: false, reason: "guest_checkout" };
  const untilDate = addMonthsUTC(new Date(), AUTO_SUSPENSION_MONTHS);
  const until = untilDate.toISOString().slice(0, 19).replace("T", " ");
  const [existing] = await db.execute("SELECT permanent,suspended_until FROM customer_account_suspensions WHERE user_id=? LIMIT 1", [userId]);
  if (existing[0] && (Number(existing[0].permanent) === 1 || (existing[0].suspended_until && new Date(existing[0].suspended_until) > untilDate))) {
    return { applied: false, reason: "already_suspended", email: row.email };
  }
  const [owners] = await db.execute("SELECT id FROM users WHERE account_type='owner' AND active=1 ORDER BY id LIMIT 1");
  const suspendedBy = owners[0] ? Number(owners[0].id) : Number(actorId);
  const reason = `Automatic: cash-on-delivery order ${orderId} was cancelled while out for delivery. ${AUTO_SUSPENSION_MONTHS}-month suspension.`;
  await db.execute(
    `INSERT INTO customer_account_suspensions (user_id,suspended_by,reason,permanent,suspended_until)
     VALUES (?,?,?,0,?) ON CONFLICT (user_id) DO UPDATE SET suspended_by=EXCLUDED.suspended_by,reason=EXCLUDED.reason,permanent=EXCLUDED.permanent,suspended_until=EXCLUDED.suspended_until,created_at=now()`,
    [userId, suspendedBy, reason, until]
  );
  await db.execute("DELETE FROM sessions WHERE user_id=?", [userId]);
  await activity(db, actorId, "customer.account_auto_suspended", `${row.email} · until ${until} · ${reason}`);
  return { applied: true, until, email: row.email };
}

async function scopedOrderRows(pool, user, limit = 100) {
  const teamWide = sharesStoreData(user);
  const params = teamWide ? [] : [user.id];
  const scope = teamWide ? "" : " AND oi.seller_id=?";
  const amount = teamWide ? "o.total" : "SUM(oi.unit_price*oi.quantity)";
  const [rows] = await pool.execute(
    `SELECT o.id,o.status,o.logistics_provider logisticsProvider,${amount} total,o.created_at,c.full_name customer_name,c.email,c.phone,c.address,c.city,c.postal_code,
       string_agg(DISTINCT oi.item_name, ', ' ORDER BY oi.item_name) items,
       SUM(oi.quantity) item_quantity
     FROM orders o JOIN customers c ON c.id=o.customer_id JOIN order_items oi ON oi.order_id=o.id
     WHERE 1=1${scope} GROUP BY o.id,o.status,o.logistics_provider,o.subtotal,o.delivery_fee,o.total,o.created_at,c.full_name,c.email,c.phone,c.address,c.city,c.postal_code
     ORDER BY o.created_at DESC LIMIT ${Math.min(200, Math.max(1, Number(limit) || 100))}`,
    params
  );
  return rows.map((row) => ({ ...row, statusLabel: statusLabels[row.status], logisticsName: logisticsName(row.logisticsProvider), total: Number(row.total), itemQuantity: Number(row.item_quantity) }));
}

async function dashboard(pool, user) {
  const ownerAccess = sharesStoreData(user); // true for owner and staff: team-wide data
  const sellerParam = ownerAccess ? [] : [user.id];
  const salesScope = ownerAccess ? "" : " AND EXISTS (SELECT 1 FROM order_items x WHERE x.order_id=o.id AND x.seller_id=?)";
  const [metricRows] = ownerAccess
    ? await pool.execute("SELECT COALESCE(SUM(o.total),0) gross_sales,COUNT(*) orders FROM orders o WHERE o.status<>'cancelled'")
    : await pool.execute("SELECT COALESCE(SUM(i.unit_price*i.quantity),0) gross_sales,COUNT(DISTINCT o.id) orders FROM orders o JOIN order_items i ON i.order_id=o.id WHERE o.status<>'cancelled' AND i.seller_id=?", sellerParam);
  const [customerRows] = await pool.execute(`SELECT COUNT(DISTINCT o.customer_id) customers FROM orders o WHERE o.status<>'cancelled'${salesScope}`, sellerParam);
  const [inquiryRows] = await pool.execute(`SELECT COUNT(*) inquiries FROM inquiries WHERE status<>'resolved'${ownerAccess ? "" : " AND seller_id=?"}`, ownerAccess ? [] : [user.id]);
  const [products] = await pool.execute(
    `SELECT p.id,p.seller_id sellerId,p.sku,p.name,p.description,p.category,p.color,p.price,p.image,p.sizes,p.colors,p.stock,p.active
     FROM products p WHERE p.active=1 ORDER BY p.created_at,p.id`
  );
  const cleanProducts = products.map((item) => ({ ...item, sellerId: Number(item.sellerId), price: Number(item.price), stock: Number(item.stock), active: Boolean(item.active), sizes: parsed(item.sizes), colors: parsed(item.colors) }));
  const [archivedRows] = await pool.execute(
    `SELECT p.id,p.seller_id sellerId,p.sku,p.name,p.description,p.category,p.color,p.price,p.image,p.sizes,p.colors,p.stock,p.active
     FROM products p WHERE p.active=0 ORDER BY p.updated_at DESC LIMIT 200`
  );
  const archivedProducts = archivedRows.map((item) => ({ ...item, sellerId: Number(item.sellerId), price: Number(item.price), stock: Number(item.stock), active: Boolean(item.active), sizes: parsed(item.sizes), colors: parsed(item.colors) }));
  const orders = await scopedOrderRows(pool, user, 100);
  const [customers] = await pool.execute(ownerAccess
    ? `SELECT c.id,c.full_name name,c.email,c.phone,COUNT(DISTINCT o.id) orderCount,COALESCE(SUM(o.total),0) lifetimeSpend,MAX(o.created_at) lastOrder
       FROM customers c JOIN orders o ON o.customer_id=c.id WHERE o.status<>'cancelled' GROUP BY c.id ORDER BY lastOrder DESC LIMIT 200`
    : `SELECT c.id,c.full_name name,c.email,c.phone,COUNT(DISTINCT o.id) orderCount,COALESCE(SUM(ci.unit_price*ci.quantity),0) lifetimeSpend,MAX(o.created_at) lastOrder
       FROM customers c JOIN orders o ON o.customer_id=c.id JOIN order_items ci ON ci.order_id=o.id AND ci.seller_id=?
       WHERE o.status<>'cancelled' GROUP BY c.id ORDER BY lastOrder DESC LIMIT 200`, sellerParam);
  const [movements] = await pool.execute(
    `SELECT m.id,m.product_id productId,p.name productName,p.sku,m.movement_type movementType,m.quantity_delta quantityDelta,m.reference_id referenceId,m.created_at createdAt
     FROM stock_movements m JOIN products p ON p.id=m.product_id ORDER BY m.created_at DESC LIMIT 100`
  );
  const [inquiries] = await pool.execute(`SELECT id,customer_name name,customer_email email,subject,message,status,response,created_at createdAt FROM inquiries WHERE 1=1${ownerAccess ? "" : " AND seller_id=?"} ORDER BY created_at DESC LIMIT 100`, ownerAccess ? [] : [user.id]);
  const [topProducts] = await pool.execute(
    `SELECT i.product_id productId,i.item_name name,SUM(i.quantity) unitsOrdered FROM order_items i JOIN orders o ON o.id=i.order_id
     WHERE o.status<>'cancelled'${ownerAccess ? "" : " AND i.seller_id=?"}
     GROUP BY i.product_id,i.item_name ORDER BY unitsOrdered DESC LIMIT 5`, ownerAccess ? [] : [user.id]
  );
  const [dailyRevenue] = await pool.execute(ownerAccess
    ? `SELECT DATE(o.created_at) AS day,SUM(o.total) revenue FROM orders o WHERE o.status<>'cancelled' AND o.created_at>=(CURRENT_DATE-29) GROUP BY DATE(o.created_at) ORDER BY day`
    : `SELECT DATE(o.created_at) AS day,SUM(i.unit_price*i.quantity) revenue FROM orders o JOIN order_items i ON i.order_id=o.id WHERE o.status<>'cancelled' AND o.created_at>=(CURRENT_DATE-29) AND i.seller_id=? GROUP BY DATE(o.created_at) ORDER BY day`, sellerParam);
  let staff = []; let sellers = []; let customerAccounts = []; let activityRows = [];
  if (user.account_type === "owner") {
    const [users] = await pool.execute("SELECT id,email,full_name name,account_type accountType,active,created_at createdAt FROM users WHERE account_type IN ('owner','seller') ORDER BY account_type,email");
    staff = users.map((row) => ({ ...row, id: Number(row.id), active: Boolean(row.active) }));
    const [sellerRows] = await pool.execute(
      `SELECT u.id,u.email,u.full_name name,u.active,
         (SELECT COUNT(*) FROM products p WHERE p.seller_id=u.id AND p.active=1) products,
         (SELECT COUNT(DISTINCT oi.order_id) FROM order_items oi JOIN orders so ON so.id=oi.order_id WHERE oi.seller_id=u.id AND so.status<>'cancelled') orders,
         (SELECT COALESCE(SUM(oi.unit_price*oi.quantity),0) FROM order_items oi JOIN orders so ON so.id=oi.order_id WHERE oi.seller_id=u.id AND so.status<>'cancelled') sales
       FROM users u WHERE u.account_type='seller' GROUP BY u.id ORDER BY u.created_at`
    );
    sellers = sellerRows.map((row) => ({ ...row, id: Number(row.id), active: Boolean(row.active), products: Number(row.products), orders: Number(row.orders), sales: Number(row.sales) }));
    const [customerAccountRows] = await pool.execute(
      `SELECT u.id,u.email,u.full_name name,u.created_at createdAt,
         ca.reason suspensionReason,ca.suspended_until suspensionUntil,ca.permanent suspensionPermanent,ca.created_at suspensionChangedAt,
         actor.full_name suspendedBy,
         CASE WHEN ca.user_id IS NULL THEN 'enabled'
              WHEN ca.permanent=1 OR ca.suspended_until IS NULL THEN 'permanent'
              WHEN ca.suspended_until>now() THEN 'temporary'
              ELSE 'expired' END suspensionStatus
       FROM users u LEFT JOIN customer_account_suspensions ca ON ca.user_id=u.id
       LEFT JOIN users actor ON actor.id=ca.suspended_by
       WHERE u.account_type='customer' ORDER BY u.created_at DESC`
    );
    customerAccounts = customerAccountRows.map((row) => ({ ...row, id: Number(row.id), suspensionPermanent: Boolean(row.suspensionPermanent) }));
    const [logs] = await pool.execute("SELECT a.id,a.event_type event,a.details,u.full_name actor,a.created_at createdAt FROM activity_logs a LEFT JOIN users u ON u.id=a.actor_user_id ORDER BY a.created_at DESC LIMIT 100");
    activityRows = logs;
  }
  return {
    user: safeUser(user),
    metrics: { grossSales: Number(metricRows[0].gross_sales), orders: Number(metricRows[0].orders), customers: Number(customerRows[0].customers), inquiries: Number(inquiryRows[0].inquiries) },
    products: cleanProducts, archivedProducts, lowStock: cleanProducts.filter((product) => product.stock < 10), orders,
    customers: customers.map((row) => ({ ...row, id: Number(row.id), orderCount: Number(row.orderCount), lifetimeSpend: Number(row.lifetimeSpend) })),
    stockMovements: movements.map((row) => ({ ...row, id: Number(row.id), quantityDelta: Number(row.quantityDelta) })),
    inquiries, topProducts: topProducts.map((row) => ({ ...row, unitsOrdered: Number(row.unitsOrdered) })),
    dailyRevenue: dailyRevenue.map((row) => ({ ...row, revenue: Number(row.revenue) })), staff, sellers, customerAccounts, activity: activityRows
  };
}

async function loadOrderReceipt(database, orderId) {
  const [orderRows] = await database.execute(
    `SELECT o.id,o.status,o.payment_method paymentMethod,o.logistics_provider logisticsProvider,o.subtotal,o.delivery_fee deliveryFee,o.total,
       o.delivery_notes deliveryNotes,o.created_at createdAt,COALESCE(rd.customer_name,c.full_name) customerName,
       COALESCE(rd.customer_email,c.email) email,COALESCE(rd.customer_phone,c.phone) phone,
       COALESCE(rd.delivery_address,c.address) address,COALESCE(rd.delivery_city,c.city) city,
       COALESCE(rd.delivery_postal_code,c.postal_code) postalCode
     FROM orders o JOIN customers c ON c.id=o.customer_id LEFT JOIN order_receipt_details rd ON rd.order_id=o.id
     WHERE o.id=? LIMIT 1`, [orderId]
  );
  const order = orderRows[0];
  if (!order) throw new Error("The saved order receipt could not be loaded.");
  const [itemRows] = await database.execute(
    `SELECT sku,item_name name,unit_price unitPrice,quantity,selected_size size,selected_color color
     FROM order_items WHERE order_id=? ORDER BY id`, [orderId]
  );
  return {
    orderId: order.id,
    status: order.status,
    paymentMethod: order.paymentMethod,
    logisticsProvider: order.logisticsProvider || "",
    logisticsName: logisticsName(order.logisticsProvider),
    createdAt: order.createdAt,
    customer: { name: order.customerName, email: order.email, phone: order.phone },
    delivery: { address: order.address, city: order.city, postalCode: order.postalCode, notes: order.deliveryNotes || "" },
    items: itemRows.map((item) => ({ ...item, unitPrice: Number(item.unitPrice), quantity: Number(item.quantity), lineTotal: Number(item.unitPrice) * Number(item.quantity) })),
    subtotal: Number(order.subtotal),
    deliveryFee: Number(order.deliveryFee),
    total: Number(order.total)
  };
}

async function refreshOlapData(pool, actorId) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    await connection.execute(
      `INSERT INTO olap_dim_product (source_product_id,product_name,category,current_price,active)
       SELECT id,name,category,price,active FROM products WHERE 1=1
       ON CONFLICT (source_product_id) DO UPDATE SET product_name=EXCLUDED.product_name,category=EXCLUDED.category,current_price=EXCLUDED.current_price,active=EXCLUDED.active`
    );
    await connection.execute(
      `INSERT INTO olap_dim_seller (source_seller_id,seller_name,account_type,active)
       SELECT id,full_name,account_type,active FROM users WHERE account_type IN ('owner','seller') AND 1=1
       ON CONFLICT (source_seller_id) DO UPDATE SET seller_name=EXCLUDED.seller_name,account_type=EXCLUDED.account_type,active=EXCLUDED.active`
    );
    await connection.execute(
      `INSERT INTO olap_dim_date (date_key,calendar_date,calendar_year,calendar_quarter,month_number,month_name,day_number,weekday_number,weekday_name)
       SELECT DISTINCT CAST(to_char(o.created_at,'YYYYMMDD') AS INTEGER),DATE(o.created_at),CAST(EXTRACT(YEAR FROM o.created_at) AS INTEGER),CAST(EXTRACT(QUARTER FROM o.created_at) AS INTEGER),
         CAST(EXTRACT(MONTH FROM o.created_at) AS INTEGER),trim(to_char(o.created_at,'FMMonth')),CAST(EXTRACT(DAY FROM o.created_at) AS INTEGER),CAST(EXTRACT(DOW FROM o.created_at)+1 AS INTEGER),trim(to_char(o.created_at,'FMDay'))
       FROM orders o WHERE 1=1
       ON CONFLICT (date_key) DO UPDATE SET calendar_year=EXCLUDED.calendar_year,calendar_quarter=EXCLUDED.calendar_quarter,month_number=EXCLUDED.month_number,
         month_name=EXCLUDED.month_name,day_number=EXCLUDED.day_number,weekday_number=EXCLUDED.weekday_number,weekday_name=EXCLUDED.weekday_name`
    );
    await connection.execute(
      `INSERT INTO olap_fact_sales
         (order_item_id,order_id,date_key,product_key,seller_key,order_status,payment_method,ordered_at,quantity,unit_price,line_value,source_updated_at)
       SELECT oi.id,o.id,d.date_key,p.product_key,s.seller_key,o.status,o.payment_method,o.created_at,oi.quantity,oi.unit_price,
         oi.unit_price*oi.quantity,o.updated_at
       FROM orders o JOIN order_items oi ON oi.order_id=o.id
       JOIN olap_dim_date d ON d.calendar_date=DATE(o.created_at)
       JOIN olap_dim_product p ON p.source_product_id=oi.product_id
       JOIN olap_dim_seller s ON s.source_seller_id=oi.seller_id
       ON CONFLICT (order_item_id) DO UPDATE SET order_id=EXCLUDED.order_id,date_key=EXCLUDED.date_key,product_key=EXCLUDED.product_key,seller_key=EXCLUDED.seller_key,
         order_status=EXCLUDED.order_status,payment_method=EXCLUDED.payment_method,ordered_at=EXCLUDED.ordered_at,
         quantity=EXCLUDED.quantity,unit_price=EXCLUDED.unit_price,line_value=EXCLUDED.line_value,source_updated_at=EXCLUDED.source_updated_at`
    );
    const [[countRow]] = await connection.execute("SELECT COUNT(*) factRowCount FROM olap_fact_sales");
    const [run] = await connection.execute("INSERT INTO olap_refresh_runs (actor_user_id,fact_row_count) VALUES (?,?)", [actorId, Number(countRow.factRowCount)]);
    await activity(connection, actorId, "olap.refreshed", `${Number(countRow.factRowCount)} order lines synchronized`);
    await connection.commit();
    const [[runRow]] = await connection.execute("SELECT created_at refreshedAt FROM olap_refresh_runs WHERE id=? LIMIT 1", [run.insertId]);
    return { ok: true, factRowCount: Number(countRow.factRowCount), refreshedAt: runRow?.refreshedAt || new Date() };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally { connection.release(); }
}

function validOlapDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const dateValue = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(dateValue.getTime()) && dateValue.toISOString().slice(0, 10) === value;
}

async function olapSummary(pool, url) {
  const today = new Date().toISOString().slice(0, 10);
  const defaultFrom = new Date(Date.now() - 29 * 86400000).toISOString().slice(0, 10);
  const from = url.searchParams.get("from") || defaultFrom;
  const to = url.searchParams.get("to") || today;
  const groupBy = url.searchParams.get("groupBy") || "month";
  if (!validOlapDate(from) || !validOlapDate(to) || from > to) throw Object.assign(new Error("Choose a valid OLAP date range."), { statusCode: 400 });
  const groupExpressions = {
    day: "to_char(d.calendar_date,'YYYY-MM-DD')",
    month: "to_char(d.calendar_date,'YYYY-MM')",
    category: "COALESCE(NULLIF(p.category,''),'Uncategorized')",
    product: "p.product_name",
    seller: "s.seller_name",
    status: "REPLACE(f.order_status,'_',' ')"
  };
  const groupKeys = {
    day: "d.calendar_date,groupLabel",
    month: "EXTRACT(YEAR FROM d.calendar_date),EXTRACT(MONTH FROM d.calendar_date),groupLabel",
    category: "groupLabel",
    product: "p.product_key,p.product_name",
    seller: "s.seller_key,s.seller_name",
    status: "f.order_status,groupLabel"
  };
  if (!Object.prototype.hasOwnProperty.call(groupExpressions, groupBy)) throw Object.assign(new Error("Choose a supported OLAP grouping."), { statusCode: 400 });
  const [totalsRows] = await pool.execute(
    `SELECT COUNT(DISTINCT CASE WHEN f.order_status<>'cancelled' THEN f.order_id END) activeOrders,
       COUNT(DISTINCT CASE WHEN f.order_status='cancelled' THEN f.order_id END) cancelledOrders,
       COALESCE(SUM(CASE WHEN f.order_status<>'cancelled' THEN f.quantity ELSE 0 END),0) units,
       COALESCE(SUM(CASE WHEN f.order_status<>'cancelled' THEN f.line_value ELSE 0 END),0) grossItemValue
     FROM olap_fact_sales f JOIN olap_dim_date d ON d.date_key=f.date_key WHERE d.calendar_date BETWEEN ? AND ?`, [from, to]
  );
  const groupOrder = groupBy === "day" || groupBy === "month" ? "MIN(d.calendar_date) ASC" : "grossItemValue DESC,groupLabel ASC";
  const [rows] = await pool.execute(
    `SELECT ${groupExpressions[groupBy]} groupLabel,
       COUNT(DISTINCT CASE WHEN f.order_status<>'cancelled' THEN f.order_id END) activeOrders,
       COUNT(DISTINCT CASE WHEN f.order_status='cancelled' THEN f.order_id END) cancelledOrders,
       COALESCE(SUM(CASE WHEN f.order_status<>'cancelled' THEN f.quantity ELSE 0 END),0) units,
       COALESCE(SUM(CASE WHEN f.order_status<>'cancelled' THEN f.line_value ELSE 0 END),0) grossItemValue
     FROM olap_fact_sales f JOIN olap_dim_date d ON d.date_key=f.date_key
     JOIN olap_dim_product p ON p.product_key=f.product_key JOIN olap_dim_seller s ON s.seller_key=f.seller_key
     WHERE d.calendar_date BETWEEN ? AND ? GROUP BY ${groupKeys[groupBy]} ORDER BY ${groupOrder} LIMIT 200`, [from, to]
  );
  const [refreshRows] = await pool.execute("SELECT created_at refreshedAt,fact_row_count factRowCount FROM olap_refresh_runs ORDER BY id DESC LIMIT 1");
  const total = totalsRows[0] || {};
  return {
    from, to, groupBy,
    totals: { activeOrders: Number(total.activeOrders || 0), cancelledOrders: Number(total.cancelledOrders || 0), units: Number(total.units || 0), grossItemValue: Number(total.grossItemValue || 0) },
    rows: rows.map((row) => ({ ...row, activeOrders: Number(row.activeOrders), cancelledOrders: Number(row.cancelledOrders), units: Number(row.units), grossItemValue: Number(row.grossItemValue) })),
    lastRefresh: refreshRows[0] ? { refreshedAt: refreshRows[0].refreshedAt, factRowCount: Number(refreshRows[0].factRowCount) } : null,
    measureNote: "Gross merchandise value excludes cancelled orders and delivery fees. COD is due on delivery, not an online payment collected."
  };
}

async function dispatchApi(request, response, url, pool) {
  const route = url.pathname;
  const method = request.method;
  if (method === "GET" && route === "/api/auth/csrf") return json(response, 200, { csrfToken: issueCsrf(request, response) });
  if (method === "GET" && route === "/api/auth/me") {
    const user = await currentUser(request, pool);
    return user ? json(response, 200, { user: safeUser(user) }) : fail(response, 401, "Sign in to continue.", "authentication_required");
  }
  if (method === "GET" && route === "/api/products") {
    const [rows] = await pool.execute("SELECT p.id,p.seller_id sellerId,p.sku,p.name,p.description,p.category,p.color,p.price,p.image,p.sizes,p.colors,p.stock,COALESCE((SELECT ROUND(AVG(r.rating),1) FROM product_reviews r WHERE r.product_id=p.id),0) ratingAverage,(SELECT COUNT(*) FROM product_reviews r WHERE r.product_id=p.id) ratingCount FROM products p WHERE p.active=1 ORDER BY p.created_at,p.id LIMIT 500");
    return json(response, 200, { products: rows.map((item) => ({ ...item, sellerId: Number(item.sellerId), price: Number(item.price), stock: Number(item.stock), ratingAverage: Number(item.ratingAverage), ratingCount: Number(item.ratingCount), sizes: parsed(item.sizes), colors: parsed(item.colors) })) });
  }
  const publicReviewsRoute = route.match(/^\/api\/products\/([a-z0-9-]+)\/reviews$/i);
  if (method === "GET" && publicReviewsRoute) {
    const [[summary]] = await pool.execute("SELECT COUNT(*) total,COALESCE(ROUND(AVG(rating),1),0) average FROM product_reviews WHERE product_id=?", [publicReviewsRoute[1]]);
    const [rows] = await pool.execute("SELECT r.id,r.rating,r.comment,r.created_at createdAt,u.full_name reviewerName FROM product_reviews r JOIN users u ON u.id=r.user_id WHERE r.product_id=? ORDER BY r.created_at DESC LIMIT 50", [publicReviewsRoute[1]]);
    return json(response, 200, { summary: { count: Number(summary.total), average: Number(summary.average) }, reviews: rows.map((row) => ({ id: Number(row.id), rating: Number(row.rating), comment: row.comment, createdAt: row.createdAt, reviewer: publicName(row.reviewerName) })) });
  }
  const uploadRead = route.match(/^\/api\/uploads\/([a-f0-9]{32})$/);
  if (method === "GET" && uploadRead) {
    const [rows] = await pool.execute("SELECT mime,data FROM product_images WHERE id=? LIMIT 1", [uploadRead[1]]);
    if (!rows.length) return fail(response, 404, "Image not found.", "not_found");
    response.writeHead(200, { "Content-Type": rows[0].mime, "Content-Length": rows[0].data.length, "Cache-Control": "public, max-age=31536000, immutable", "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "default-src 'none'; sandbox" });
    response.end(rows[0].data);
    return true;
  }

  if (method !== "GET" && !validateCsrf(request, response)) return true;
  if (method === "POST" && route === "/api/auth/login") {
    const body = await readJson(request); const address = email(body.email); const pass = typeof body.password === "string" && Buffer.byteLength(body.password, "utf8") <= 72 ? body.password : "";
    const attemptKey = digest(address);
    const [attempts] = await pool.execute("SELECT attempts,locked_until FROM login_attempts WHERE email_hash=? LIMIT 1", [attemptKey]);
    if (attempts[0]?.locked_until && new Date(attempts[0].locked_until).getTime() > Date.now()) return fail(response, 429, "Too many attempts. Wait 15 minutes before trying again.", "login_throttled");
    if (attempts[0]?.locked_until) await pool.execute("DELETE FROM login_attempts WHERE email_hash=? AND locked_until<=now()", [attemptKey]);
    const [rows] = await pool.execute("SELECT id,email,full_name,password_hash,account_type,active FROM users WHERE email=? LIMIT 1", [address]);
    const user = rows[0];
    const matches = await bcrypt.compare(pass, user?.password_hash || timingHash);
    if (user?.active && user.account_type === "customer" && matches) {
      const suspension = await activeCustomerSuspension(pool, address);
      if (suspension) {
        await pool.execute("DELETE FROM login_attempts WHERE email_hash=?", [attemptKey]);
        return fail(response, 403, "Your customer account is currently disabled. Contact JACOH to discuss the reported violation.", "account_suspended");
      }
    }
    if (!user || !user.active || !matches) {
      await pool.execute("DELETE FROM login_attempts WHERE email_hash=? AND locked_until IS NOT NULL AND locked_until<=now()", [attemptKey]);
      await pool.execute(
        `INSERT INTO login_attempts (email_hash,attempts,locked_until) VALUES (?,1,NULL)
         ON CONFLICT (email_hash) DO UPDATE SET locked_until=CASE WHEN login_attempts.attempts+1>=5 THEN now()+interval '15 minutes' ELSE login_attempts.locked_until END,attempts=LEAST(login_attempts.attempts+1,5)`,
        [attemptKey]
      );
      return fail(response, 401, "Email or password is incorrect.", "invalid_credentials");
    }
    await pool.execute("DELETE FROM login_attempts WHERE email_hash=?", [attemptKey]);
    await pool.execute("DELETE FROM sessions WHERE user_id=? AND expires_at<now()", [user.id]);
    await startSession(request, response, pool, user.id, body.remember === true);
    await activity(pool, user.id, "account.sign_in", "Signed in");
    const redirect = user.account_type === "owner" ? "/owner" : user.account_type === "seller" ? "/seller" : "/";
    return json(response, 200, { user: safeUser(user), redirect });
  }
  if (method === "POST" && route === "/api/auth/signup") {
    const body = await readJson(request); const name = text(body.name, 120, "Full name"); const address = email(body.email); const pass = password(body.password);
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      const hash = await bcrypt.hash(pass, 12);
      const [insert] = await connection.execute("INSERT INTO users (email,full_name,password_hash,account_type) VALUES (?,?,?,'customer')", [address, name, hash]);
      await connection.execute("INSERT INTO customers (user_id,email,full_name) VALUES (?,?,?) ON CONFLICT (email) DO UPDATE SET user_id=EXCLUDED.user_id,full_name=EXCLUDED.full_name", [insert.insertId, address, name]);
      await connection.commit();
      await startSession(request, response, pool, insert.insertId, true);
      return json(response, 201, { user: { id: Number(insert.insertId), email: address, name, accountType: "customer" }, redirect: "/" });
    } catch (error) {
      await connection.rollback();
      if (error.code === "ER_DUP_ENTRY") return fail(response, 409, "An account with that email already exists.", "email_in_use");
      throw error;
    } finally { connection.release(); }
  }
  if (method === "POST" && route === "/api/auth/logout") {
    const user = await currentUser(request, pool); await endSession(request, response, pool);
    if (user) await activity(pool, user.id, "account.sign_out", "Signed out");
    return json(response, 200, { ok: true, redirect: "/" });
  }
  if (method === "POST" && route === "/api/auth/password") {
    const user = await currentUser(request, pool);
    if (!user) return fail(response, 401, "Sign in to continue.", "authentication_required");
    const body = await readJson(request); const [rows] = await pool.execute("SELECT password_hash FROM users WHERE id=? LIMIT 1", [user.id]);
    if (!await bcrypt.compare(typeof body.currentPassword === "string" ? body.currentPassword : "", rows[0].password_hash)) return fail(response, 401, "Current password is incorrect.", "invalid_password");
    const newPass = password(body.newPassword); const hash = await bcrypt.hash(newPass, 12);
    await pool.execute("UPDATE users SET password_hash=? WHERE id=?", [hash, user.id]);
    await pool.execute("DELETE FROM sessions WHERE user_id=?", [user.id]);
    await activity(pool, user.id, "account.password_changed", "Password changed");
    clearCookie(response, request, SESSION_COOKIE, true);
    return json(response, 200, { ok: true, redirect: "/sign-in" });
  }

  if (method === "POST" && route === "/api/newsletter") {
    const body = await readJson(request); const address = email(body.email);
    await pool.execute("INSERT INTO newsletter_subscribers (email) VALUES (?) ON CONFLICT (email) DO NOTHING", [address]);
    return json(response, 201, { ok: true, message: "Your address is saved. Email delivery isn't configured yet." });
  }
  if (method === "POST" && route === "/api/inquiries") {
    const body = await readJson(request); const submittedName = text(body.name, 120, "Name"); const address = email(body.email);
    const subject = text(body.subject, 180, "Subject"); const message = text(body.message, 4000, "Message");
    const signedIn = await currentUser(request, pool);
    if (!signedIn) return fail(response, 401, "Sign in to send an inquiry and follow its replies.", "authentication_required");
    if (signedIn?.account_type === "customer" && signedIn.email !== address) return fail(response, 403, "Use the email address on your customer account.", "customer_email_mismatch");
    const name = signedIn?.account_type === "customer" ? signedIn.full_name : submittedName;
    const productId = body.productId ? text(body.productId, 64, "Product") : "";
    const assignee = await assignInquiryStaff(pool, productId, signedIn);
    let customerId = null;
    if (signedIn?.account_type === "customer" && signedIn.email === address) {
      const [customerRows] = await pool.execute("SELECT id FROM customers WHERE user_id=? LIMIT 1", [signedIn.id]);
      customerId = customerRows[0]?.id || null;
    } else if (signedIn && ["owner", "seller"].includes(signedIn.account_type)) {
      const [customerRows] = await pool.execute("SELECT id FROM customers WHERE email=? LIMIT 1", [address]);
      customerId = customerRows[0]?.id || null;
    }
    const [insert] = await pool.execute("INSERT INTO inquiries (customer_id,seller_id,customer_name,customer_email,subject,message) VALUES (?,?,?,?,?,?)", [customerId, assignee?.id || null, name, address, subject, message]);
    return json(response, 201, { ok: true, id: Number(insert.insertId), assignedStaffName: assignee?.name || "JACOH Support", message: "Your note is with the JACOH team." });
  }
  if (method === "POST" && route === "/api/orders") {
    // Checkout requires a signed-in customer account. Guests may fill a bag but cannot place an order.
    const signedIn = await currentUser(request, pool);
    if (!signedIn || signedIn.account_type !== "customer") return fail(response, 401, "Please sign in to your customer account to place an order.", "login_required");
    const body = await readJson(request); const name = text(body.name, 120, "Name"); const address = signedIn.email; // orders always belong to the signed-in account
    const phone = text(body.phone, 40, "Phone number"); const street = text(body.address, 255, "Street address");
    const city = text(body.city, 120, "City"); const postal = text(body.postalCode, 24, "Postal code"); const notes = text(body.notes || "", 500, "Delivery notes", false);
    const clientReference = text(body.idempotencyKey, 64, "Checkout reference");
    if (!/^[A-Za-z0-9-]{16,64}$/.test(clientReference)) return fail(response, 400, "Refresh checkout and try again.", "invalid_checkout_reference");
    if (body.paymentMethod !== "cash_on_delivery") return fail(response, 400, "Cash on delivery is the only payment method configured.", "payment_unavailable");
    const logisticsProvider = body.logisticsProvider === undefined || body.logisticsProvider === null || body.logisticsProvider === "" ? null : String(body.logisticsProvider);
    if (logisticsProvider !== null && !logisticsProviders.some((item) => item.id === logisticsProvider)) return fail(response, 400, "Choose one of the available logistics providers.", "invalid_logistics");
    if (!Array.isArray(body.items) || body.items.length < 1 || body.items.length > 30 || body.items.some((item) => !item || typeof item !== "object" || Array.isArray(item))) return fail(response, 400, "Your bag is empty or invalid.", "invalid_cart");
    const lines = body.items.map((item) => ({ id: text(item.id, 64, "Product"), size: text(item.size, 24, "Size"), color: text(item.color, 64, "Color"), quantity: Number(item.quantity) }));
    if (lines.some((item) => !Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 10)) return fail(response, 400, "Each quantity must be between one and ten.", "invalid_quantity");
    const totalsByProduct = new Map();
    for (const line of lines) totalsByProduct.set(line.id, (totalsByProduct.get(line.id) || 0) + line.quantity);
    const requestHash = digest(JSON.stringify({ name, address, phone, street, city, postal, notes, lines }));
    if (await activeCustomerSuspension(pool, address)) return fail(response, 403, "This customer account is currently disabled and cannot place an order.", "account_suspended");
    const [priorOrders] = await pool.execute("SELECT id,subtotal,delivery_fee,total,request_hash FROM orders WHERE client_reference=? LIMIT 1", [clientReference]);
    if (priorOrders.length) {
      const prior = priorOrders[0];
      if (prior.request_hash !== requestHash) return fail(response, 409, "This checkout was already submitted. Refresh your bag to continue.", "checkout_already_submitted");
      const receipt = await loadOrderReceipt(pool, prior.id);
      return json(response, 200, { ok: true, orderId: prior.id, subtotal: Number(prior.subtotal), deliveryFee: Number(prior.delivery_fee), total: Number(prior.total), paymentMethod: "cash_on_delivery", receipt });
    }
    const accountId = signedIn.id;
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      const checked = []; const lockedProducts = new Map(); let subtotal = 0;
      for (const line of lines) {
        let product = lockedProducts.get(line.id);
        if (!product) {
          const [items] = await connection.execute("SELECT id,seller_id,sku,name,price,sizes,colors,stock FROM products WHERE id=? AND active=1 FOR UPDATE", [line.id]);
          product = items[0];
          if (product) lockedProducts.set(line.id, product);
        }
        if (!product) throw Object.assign(new Error("One of the items is no longer available."), { statusCode: 409 });
        if (!parsed(product.sizes).includes(line.size) || !parsed(product.colors).some((item) => item.name === line.color)) throw Object.assign(new Error(`${product.name} has an invalid size or color.`), { statusCode: 400 });
        if (Number(product.stock) < totalsByProduct.get(line.id)) throw Object.assign(new Error(`${product.name} has insufficient stock.`), { statusCode: 409 });
        subtotal += Number(product.price) * line.quantity; checked.push({ ...line, product, price: Number(product.price) });
      }
      if (new Set(checked.map((line) => Number(line.product.seller_id))).size > 1) {
        throw Object.assign(new Error("Please place separate orders for products assigned to different Sellers."), { statusCode: 400 });
      }
      const shipping = subtotal >= freeDelivery ? 0 : deliveryFee; const total = subtotal + shipping;
      await connection.execute(
        `INSERT INTO customers (user_id,email,full_name,phone,address,city,postal_code) VALUES (?,?,?,?,?,?,?)
         ON CONFLICT (email) DO UPDATE SET user_id=COALESCE(EXCLUDED.user_id,customers.user_id),full_name=EXCLUDED.full_name,phone=EXCLUDED.phone,address=EXCLUDED.address,city=EXCLUDED.city,postal_code=EXCLUDED.postal_code`,
        [accountId, address, name, phone, street, city, postal]
      );
      const [customer] = await connection.execute("SELECT id FROM customers WHERE email=? LIMIT 1", [address]);
      const orderId = `JH-${crypto.randomBytes(5).toString("hex").toUpperCase()}`;
      await connection.execute("INSERT INTO orders (id,customer_id,status,payment_method,subtotal,delivery_fee,total,client_reference,request_hash,delivery_notes,logistics_provider) VALUES (?,?,'to_pack','cash_on_delivery',?,?,?,?,?,?,?)", [orderId, customer[0].id, subtotal, shipping, total, clientReference, requestHash, notes, logisticsProvider]);
      await connection.execute("INSERT INTO order_receipt_details (order_id,customer_name,customer_email,customer_phone,delivery_address,delivery_city,delivery_postal_code) VALUES (?,?,?,?,?,?,?)", [orderId, name, address, phone, street, city, postal]);
      for (const line of checked) {
        await connection.execute("INSERT INTO order_items (order_id,product_id,seller_id,sku,item_name,unit_price,quantity,selected_size,selected_color) VALUES (?,?,?,?,?,?,?,?,?)", [orderId, line.id, line.product.seller_id, line.product.sku, line.product.name, line.price, line.quantity, line.size, line.color]);
        await connection.execute("UPDATE products SET stock=stock-? WHERE id=? AND stock>=?", [line.quantity, line.id, line.quantity]);
        await connection.execute("INSERT INTO stock_movements (product_id,seller_id,movement_type,quantity_delta,reference_id) VALUES (?,?,'sale',?,?)", [line.id, line.product.seller_id, -line.quantity, orderId]);
      }
      await connection.commit();
      const receipt = await loadOrderReceipt(connection, orderId);
      return json(response, 201, { ok: true, orderId, subtotal, deliveryFee: shipping, total, paymentMethod: "cash_on_delivery", receipt });
    } catch (error) {
      await connection.rollback();
      if (error.statusCode) return fail(response, error.statusCode, error.message, "order_rejected");
      if (error.code === "ER_DUP_ENTRY") {
        const [priorOrders] = await connection.execute("SELECT id,subtotal,delivery_fee,total,request_hash FROM orders WHERE client_reference=? LIMIT 1", [clientReference]);
        if (priorOrders.length && priorOrders[0].request_hash === requestHash) {
          const prior = priorOrders[0];
          const receipt = await loadOrderReceipt(connection, prior.id);
          return json(response, 200, { ok: true, orderId: prior.id, subtotal: Number(prior.subtotal), deliveryFee: Number(prior.delivery_fee), total: Number(prior.total), paymentMethod: "cash_on_delivery", receipt });
        }
      }
      throw error;
    } finally { connection.release(); }
  }

  if (method === "GET" && route === "/api/customer/inquiries") {
    const customerUser = await currentUser(request, pool);
    if (!customerUser || customerUser.account_type !== "customer") return fail(response, 401, "Sign in with your customer account to view inquiries.", "authentication_required");
    const [customerRows] = await pool.execute("SELECT id FROM customers WHERE user_id=? LIMIT 1", [customerUser.id]);
    if (!customerRows.length) return json(response, 200, { inquiries: [] });
    const [rows] = await pool.execute(
      `SELECT i.id,i.subject,i.message,i.status,i.response,i.created_at createdAt,
         assigned.full_name assignedStaffName,responder.full_name responderName
       FROM inquiries i LEFT JOIN users assigned ON assigned.id=i.seller_id
       LEFT JOIN users responder ON responder.id=i.responded_by
       WHERE i.customer_id=? ORDER BY i.created_at DESC LIMIT 100`, [customerRows[0].id]
    );
    return json(response, 200, { inquiries: rows });
  }

  if (route.startsWith("/api/customer/") && ["GET", "PATCH", "POST"].includes(method) && route !== "/api/customer/inquiries") {
    const customer = await currentUser(request, pool);
    if (!customer || customer.account_type !== "customer") return fail(response, 401, "Sign in with your customer account to continue.", "authentication_required");
    if (method === "GET" && route === "/api/customer/profile") {
      const [rows] = await pool.execute("SELECT phone,address,city,postal_code postalCode FROM customers WHERE user_id=? LIMIT 1", [customer.id]);
      const detail = rows[0] || {};
      return json(response, 200, { profile: { email: customer.email, fullName: customer.full_name, phone: detail.phone || "", address: detail.address || "", city: detail.city || "", postalCode: detail.postalCode || "" } });
    }
    if (method === "PATCH" && route === "/api/customer/profile") {
      const body = await readJson(request);
      const fullName = text(body.fullName, 120, "Full name"); const phone = text(body.phone || "", 40, "Phone number", false);
      const address = text(body.address || "", 255, "Street address", false); const city = text(body.city || "", 120, "City", false); const postal = text(body.postalCode || "", 24, "Postal code", false);
      await pool.execute("UPDATE users SET full_name=? WHERE id=?", [fullName, customer.id]);
      const [updated] = await pool.execute("UPDATE customers SET full_name=?,phone=?,address=?,city=?,postal_code=? WHERE user_id=?", [fullName, phone, address, city, postal, customer.id]);
      if (!updated.affectedRows) await pool.execute("INSERT INTO customers (user_id,email,full_name,phone,address,city,postal_code) VALUES (?,?,?,?,?,?,?) ON CONFLICT (email) DO UPDATE SET user_id=EXCLUDED.user_id,full_name=EXCLUDED.full_name,phone=EXCLUDED.phone,address=EXCLUDED.address,city=EXCLUDED.city,postal_code=EXCLUDED.postal_code", [customer.id, customer.email, fullName, phone, address, city, postal]);
      await activity(pool, customer.id, "account.profile_updated", "Profile updated");
      return json(response, 200, { ok: true });
    }
    if (method === "GET" && route === "/api/customer/orders") {
      const [orders] = await pool.execute("SELECT o.id,o.status,o.payment_method paymentMethod,o.logistics_provider logisticsProvider,o.subtotal,o.delivery_fee deliveryFee,o.total,o.created_at createdAt,o.updated_at updatedAt FROM orders o JOIN customers c ON c.id=o.customer_id WHERE c.user_id=? ORDER BY o.created_at DESC LIMIT 50", [customer.id]);
      const [items] = await pool.execute("SELECT oi.order_id orderId,oi.product_id productId,oi.item_name itemName,oi.unit_price unitPrice,oi.quantity,oi.selected_size selectedSize,oi.selected_color selectedColor,p.image,r.rating reviewRating,r.comment reviewComment FROM order_items oi JOIN orders o ON o.id=oi.order_id JOIN customers c ON c.id=o.customer_id LEFT JOIN products p ON p.id=oi.product_id LEFT JOIN product_reviews r ON r.product_id=oi.product_id AND r.user_id=c.user_id WHERE c.user_id=? ORDER BY oi.id", [customer.id]);
      return json(response, 200, { logisticsOptions: logisticsProviders, orders: orders.map((order) => ({ ...order,
        logisticsName: logisticsName(order.logisticsProvider),
        canChangeCourier: order.status === "to_pack",
        canCancel: CUSTOMER_CANCELLABLE.includes(order.status),
        cancelPenalty: order.status === "out_for_delivery" && order.paymentMethod === "cash_on_delivery",
        penaltyMonths: AUTO_SUSPENSION_MONTHS,
        subtotal: Number(order.subtotal), deliveryFee: Number(order.deliveryFee), total: Number(order.total), items: items.filter((item) => item.orderId === order.id).map((item) => ({ ...item, unitPrice: Number(item.unitPrice), quantity: Number(item.quantity), reviewRating: item.reviewRating === null ? null : Number(item.reviewRating) })) })) });
    }
    const courierRoute = route.match(/^\/api\/customer\/orders\/([A-Z0-9-]+)\/logistics$/i);
    if (method === "PATCH" && courierRoute) {
      const body = await readJson(request); const provider = String(body.provider || "");
      if (!logisticsProviders.some((item) => item.id === provider)) return fail(response, 400, "Choose one of the available logistics providers.", "invalid_logistics");
      const [updated] = await pool.execute("UPDATE orders SET logistics_provider=? WHERE id=? AND status='to_pack' AND customer_id IN (SELECT id FROM customers WHERE user_id=?)", [provider, courierRoute[1], customer.id]);
      if (!updated.affectedRows) return fail(response, 409, "The courier can only be changed before your order is packed.", "courier_locked");
      await activity(pool, customer.id, "order.courier_changed", `${courierRoute[1]} → ${logisticsName(provider)}`);
      return json(response, 200, { ok: true, logisticsProvider: provider, logisticsName: logisticsName(provider) });
    }
    const cancelRoute = route.match(/^\/api\/customer\/orders\/([A-Z0-9-]+)\/cancel$/i);
    if (method === "POST" && cancelRoute) {
      const connection = await pool.getConnection();
      try {
        await connection.beginTransaction();
        const [found] = await connection.execute("SELECT o.id,o.status,o.payment_method paymentMethod FROM orders o JOIN customers c ON c.id=o.customer_id WHERE o.id=? AND c.user_id=? FOR UPDATE OF o", [cancelRoute[1], customer.id]);
        const order = found[0];
        if (!order) { await connection.rollback(); return fail(response, 404, "Order not found.", "order_not_found"); }
        if (!CUSTOMER_CANCELLABLE.includes(order.status)) { await connection.rollback(); return fail(response, 409, "This order can no longer be cancelled.", "not_cancellable"); }
        await connection.execute("UPDATE orders SET status='cancelled' WHERE id=?", [order.id]);
        const penalty = order.status === "out_for_delivery" && order.paymentMethod === "cash_on_delivery";
        let suspension = { applied: false };
        if (penalty) {
          suspension = await applyAutoSuspension(connection, order.id, customer.id);
        } else if (order.status !== "out_for_delivery") {
          // Parcel never left the store: return the stock.
          const [lines] = await connection.execute("SELECT product_id,seller_id,quantity FROM order_items WHERE order_id=?", [order.id]);
          for (const line of lines) {
            await connection.execute("UPDATE products SET stock=stock+? WHERE id=?", [Number(line.quantity), line.product_id]);
            await connection.execute("INSERT INTO stock_movements (product_id,seller_id,movement_type,quantity_delta,reference_id) VALUES (?,?,'cancel_return',?,?)", [line.product_id, line.seller_id, Number(line.quantity), order.id]);
          }
        }
        await activity(connection, customer.id, "order.cancelled_by_customer", `${order.id} (was ${order.status})`);
        await connection.commit();
        return json(response, 200, { ok: true, orderId: order.id, penalty, suspended: Boolean(suspension.applied), suspensionUntil: suspension.until || null, months: AUTO_SUSPENSION_MONTHS });
      } catch (error) { await connection.rollback(); throw error; }
      finally { connection.release(); }
    }
    const reviewPost = route.match(/^\/api\/customer\/reviews\/([a-z0-9-]+)$/i);
    if (method === "POST" && reviewPost) {
      const body = await readJson(request); const rating = Number(body.rating); const comment = text(body.comment || "", 1000, "Review", false);
      if (!Number.isInteger(rating) || rating < 1 || rating > 5) return fail(response, 400, "Choose a rating from 1 to 5 stars.", "invalid_rating");
      const [eligible] = await pool.execute("SELECT o.id FROM orders o JOIN customers c ON c.id=o.customer_id JOIN order_items oi ON oi.order_id=o.id WHERE c.user_id=? AND oi.product_id=? AND o.status='completed' ORDER BY o.updated_at DESC LIMIT 1", [customer.id, reviewPost[1]]);
      if (!eligible.length) return fail(response, 403, "You can review a product after your order has been delivered.", "review_not_allowed");
      await pool.execute("INSERT INTO product_reviews (product_id,user_id,order_id,rating,comment) VALUES (?,?,?,?,?) ON CONFLICT (user_id,product_id) DO UPDATE SET rating=EXCLUDED.rating,comment=EXCLUDED.comment,order_id=EXCLUDED.order_id,updated_at=now()", [reviewPost[1], customer.id, eligible[0].id, rating, comment]);
      await activity(pool, customer.id, "review.saved", `${reviewPost[1]} ${rating}/5`);
      return json(response, 200, { ok: true });
    }
    return fail(response, 404, "Endpoint not found.", "not_found");
  }

  const user = await requireUser(request, response, pool);
  if (!user) return true;
  if (method === "POST" && route === "/api/uploads/product-image") {
    const buffer = await readBuffer(request, 2 * 1024 * 1024);
    const mime = imageKind(buffer);
    if (!mime) return fail(response, 400, "Upload a JPG, PNG or WebP image.", "invalid_image");
    const id = require("node:crypto").randomBytes(16).toString("hex");
    await pool.execute("INSERT INTO product_images (id,mime,data,size,uploaded_by) VALUES (?,?,?,?,?)", [id, mime, buffer, buffer.length, user.id]);
    return json(response, 201, { ok: true, path: `/api/uploads/${id}` });
  }
  if (method === "POST" && route === "/api/olap/refresh") {
    if (user.account_type !== "owner") return fail(response, 403, "Owner access is required for OLAP analytics.", "forbidden");
    return json(response, 200, await refreshOlapData(pool, user.id));
  }
  if (method === "GET" && route === "/api/olap/summary") {
    if (user.account_type !== "owner") return fail(response, 403, "Owner access is required for OLAP analytics.", "forbidden");
    try { return json(response, 200, await olapSummary(pool, url)); }
    catch (error) { if (error.statusCode) return fail(response, error.statusCode, error.message, "invalid_olap_filter"); throw error; }
  }
  if (method === "GET" && route === "/api/dashboard") return json(response, 200, await dashboard(pool, user));
  if (method === "GET" && route === "/api/orders") return json(response, 200, { orders: await scopedOrderRows(pool, user) });
  if (method === "GET" && route === "/api/customers") { const data = await dashboard(pool, user); return json(response, 200, { customers: data.customers }); }
  if (method === "GET" && route === "/api/inquiries") { const data = await dashboard(pool, user); return json(response, 200, { inquiries: data.inquiries }); }
  if (method === "GET" && route === "/api/reports") {
    const data = await dashboard(pool, user);
    return json(response, 200, { metrics: data.metrics, dailyRevenue: data.dailyRevenue, topProducts: data.topProducts });
  }

  const customerAccountRoute = route.match(/^\/api\/customer-accounts\/(\d+)$/);
  if (method === "PATCH" && customerAccountRoute) {
    if (user.account_type !== "owner") return fail(response, 403, "Owner access is required.", "forbidden");
    const body = await readJson(request); const action = text(body.action, 16, "Account action");
    if (!new Set(["suspend", "enable"]).has(action)) return fail(response, 400, "Choose suspend or enable.", "invalid_account_action");
    let reason = ""; let permanent = false; let suspensionUntil = null; let durationDays = 0;
    if (action === "suspend") {
      reason = text(body.reason, 500, "Violation reason");
      if (reason.length < 5) return fail(response, 400, "Enter a brief violation reason of at least five characters.", "invalid_reason");
      if (typeof body.permanent !== "boolean") return fail(response, 400, "Choose a temporary or permanent suspension.", "invalid_duration");
      permanent = body.permanent;
      if (!permanent) {
        durationDays = Number(body.durationDays);
        if (!Number.isInteger(durationDays) || durationDays < 1 || durationDays > 3650) return fail(response, 400, "Temporary suspensions must be between 1 and 3,650 days.", "invalid_duration");
        suspensionUntil = expiryDate(durationDays);
      }
    }
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      const [customerRows] = await connection.execute("SELECT id,email FROM users WHERE id=? AND account_type='customer' FOR UPDATE", [customerAccountRoute[1]]);
      if (!customerRows.length) { await connection.rollback(); return fail(response, 404, "Customer account not found.", "customer_not_found"); }
      const customer = customerRows[0];
      if (action === "enable") {
        await connection.execute("DELETE FROM customer_account_suspensions WHERE user_id=?", [customer.id]);
        await activity(connection, user.id, "customer.account_enabled", `${customer.email} enabled by Owner`);
        await connection.commit();
        return json(response, 200, { ok: true, status: "enabled" });
      }
      await connection.execute(
        `INSERT INTO customer_account_suspensions (user_id,suspended_by,reason,permanent,suspended_until)
         VALUES (?,?,?,?,?) ON CONFLICT (user_id) DO UPDATE SET suspended_by=EXCLUDED.suspended_by,reason=EXCLUDED.reason,permanent=EXCLUDED.permanent,suspended_until=EXCLUDED.suspended_until,created_at=now()`,
        [customer.id, user.id, reason, permanent ? 1 : 0, suspensionUntil]
      );
      await connection.execute("DELETE FROM sessions WHERE user_id=?", [customer.id]);
      await activity(connection, user.id, "customer.account_suspended", `${customer.email} · ${permanent ? "permanent suspension" : `suspended until ${suspensionUntil}`} · ${reason}`);
      await connection.commit();
      return json(response, 200, { ok: true, status: permanent ? "permanent" : "temporary", suspensionUntil, durationDays });
    } catch (error) { await connection.rollback(); throw error; }
    finally { connection.release(); }
  }

  const orderStatus = route.match(/^\/api\/orders\/([A-Z0-9-]+)\/status$/i);
  if (method === "PATCH" && orderStatus) {
    const body = await readJson(request); const next = text(body.status, 24, "Order status");
    if (!validStatuses.has(next)) return fail(response, 400, "Choose a valid order status.", "invalid_status");
    const [rows] = sharesStoreData(user)
      ? await pool.execute("SELECT status,payment_method paymentMethod,1 seller_count FROM orders WHERE id=? LIMIT 1", [orderStatus[1]])
      : await pool.execute("SELECT o.status,COUNT(DISTINCT i.seller_id) seller_count FROM orders o JOIN order_items i ON i.order_id=o.id WHERE o.id=? AND EXISTS (SELECT 1 FROM order_items mine WHERE mine.order_id=o.id AND mine.seller_id=?) GROUP BY o.id,o.status LIMIT 1", [orderStatus[1], user.id]);
    if (!rows.length) return fail(response, 404, "Order not found.", "order_not_found");
    if (user.account_type !== "owner" && Number(rows[0].seller_count) > 1) return fail(response, 403, "Only the store owner can update a multi-seller order.", "mixed_seller_order");
    if (!transitions[rows[0].status].includes(next)) return fail(response, 409, "That order status transition is not allowed.", "invalid_transition");
    // An out-for-delivery order can be cancelled by the customer (penalty applies) or by the store/courier (no penalty).
    const cancelledBy = body.cancelledBy === "customer" ? "customer" : body.cancelledBy === "store" ? "store" : "";
    if (rows[0].status === "out_for_delivery" && next === "cancelled" && !cancelledBy) return fail(response, 400, "Say whether the customer or the store cancelled this out-for-delivery order.", "cancelled_by_required");
    const penalise = rows[0].status === "out_for_delivery" && next === "cancelled" && cancelledBy === "customer" && rows[0].paymentMethod === "cash_on_delivery";
    if (!penalise) {
      await pool.execute("UPDATE orders SET status=? WHERE id=?", [next, orderStatus[1]]);
      await activity(pool, user.id, "order.status", `${orderStatus[1]} → ${next}${cancelledBy ? ` (cancelled by ${cancelledBy})` : ""}`);
      return json(response, 200, { ok: true, status: next });
    }
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      const [updated] = await connection.execute("UPDATE orders SET status='cancelled' WHERE id=? AND status='out_for_delivery'", [orderStatus[1]]);
      if (!updated.affectedRows) { await connection.rollback(); return fail(response, 409, "That order status transition is not allowed.", "invalid_transition"); }
      const suspension = await applyAutoSuspension(connection, orderStatus[1], user.id);
      await activity(connection, user.id, "order.status", `${orderStatus[1]} → cancelled (cancelled by customer while out for delivery)`);
      await connection.commit();
      return json(response, 200, { ok: true, status: next, customerSuspended: Boolean(suspension.applied), suspensionUntil: suspension.until || null, suspensionNote: suspension.reason || "", months: AUTO_SUSPENSION_MONTHS });
    } catch (error) { await connection.rollback(); throw error; }
    finally { connection.release(); }
  }

  if (method === "POST" && route === "/api/products") {
    const body = await readJson(request); const item = productInput(body, 0);
    const sellerId = user.account_type === "owner" ? Number(body.sellerId || user.id) : Number(user.id);
    if (!Number.isSafeInteger(sellerId) || sellerId < 1) return fail(response, 400, "Select a valid seller account.", "invalid_seller");
    const [owners] = await pool.execute("SELECT id FROM users WHERE id=? AND account_type IN ('owner','seller') AND active=1 LIMIT 1", [sellerId]);
    if (!owners.length) return fail(response, 400, "Seller account not found.", "invalid_seller");
    const id = text(body.id || item.sku.toLowerCase().replace(/[^a-z0-9-]/g, "-"), 64, "Product ID");
    if (!/^[a-z0-9-]+$/i.test(id)) return fail(response, 400, "Product ID may contain only letters, numbers and hyphens.", "invalid_product_id");
    try {
      await pool.execute("INSERT INTO products (id,seller_id,sku,name,description,category,color,price,image,sizes,colors,stock) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)", [id, sellerId, item.sku, item.name, item.description, item.category, item.color, item.price, item.image, JSON.stringify(item.sizes), JSON.stringify(item.colors), item.stock]);
      if (item.stock) await pool.execute("INSERT INTO stock_movements (product_id,seller_id,actor_user_id,movement_type,quantity_delta,reference_id) VALUES (?,?,?,'initial',?,?)", [id, sellerId, user.id, item.stock, "product-created"]);
      await activity(pool, user.id, "product.created", item.name);
      return json(response, 201, { ok: true, id });
    } catch (error) { if (error.code === "ER_DUP_ENTRY") return fail(response, 409, "That SKU or product ID already exists.", "product_exists"); throw error; }
  }

  const restoreProductRoute = route.match(/^\/api\/products\/([a-z0-9-]+)\/restore$/i);
  if (method === "POST" && restoreProductRoute) {
    const [rows] = await pool.execute("SELECT id,seller_id,name FROM products WHERE id=? AND active=0 LIMIT 1", [restoreProductRoute[1]]);
    const product = rows[0];
    if (!product) return fail(response, 404, "Archived product not found.", "product_not_found");
    await pool.execute("UPDATE products SET active=1 WHERE id=? AND active=0", [product.id]);
    await activity(pool, user.id, "product.restored", product.name);
    return json(response, 200, { ok: true });
  }

  const productRoute = route.match(/^\/api\/products\/([a-z0-9-]+)$/i);
  if (productRoute && ["PUT", "DELETE"].includes(method)) {
    const [rows] = await pool.execute("SELECT id,seller_id,stock,name FROM products WHERE id=? AND active=1 LIMIT 1", [productRoute[1]]); const existing = rows[0];
    if (!existing) return fail(response, 404, "Product not found.", "product_not_found");
    if (method === "DELETE") {
      await pool.execute("UPDATE products SET active=0 WHERE id=?", [existing.id]);
      await activity(pool, user.id, "product.archived", existing.name);
      return json(response, 200, { ok: true });
    }
    const item = productInput(await readJson(request), Number(existing.stock));
    await pool.execute("UPDATE products SET sku=?,name=?,description=?,category=?,color=?,price=?,image=?,sizes=?,colors=? WHERE id=?", [item.sku,item.name,item.description,item.category,item.color,item.price,item.image,JSON.stringify(item.sizes),JSON.stringify(item.colors),existing.id]);
    await activity(pool, user.id, "product.updated", item.name);
    return json(response, 200, { ok: true });
  }

  const stockRoute = route.match(/^\/api\/products\/([a-z0-9-]+)\/stock$/i);
  if (method === "POST" && stockRoute) {
    const body = await readJson(request); const quantity = Number(body.quantity); const reference = text(body.reference || "Manual restock", 64, "Reference", false);
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 100000) return fail(response, 400, "Enter a restock quantity from 1 to 100,000.", "invalid_quantity");
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      const [rows] = await connection.execute("SELECT id,seller_id,name FROM products WHERE id=? AND active=1 FOR UPDATE", [stockRoute[1]]); const product = rows[0];
      if (!product) { await connection.rollback(); return fail(response, 404, "Product not found.", "product_not_found"); }
      await connection.execute("UPDATE products SET stock=stock+? WHERE id=?", [quantity, product.id]);
      await connection.execute("INSERT INTO stock_movements (product_id,seller_id,actor_user_id,movement_type,quantity_delta,reference_id) VALUES (?,?,?,'restock',?,?)", [product.id, product.seller_id, user.id, quantity, reference]);
      await connection.commit(); await activity(pool, user.id, "stock.received", `${product.name} +${quantity}`);
      return json(response, 200, { ok: true });
    } catch (error) { await connection.rollback(); throw error; }
    finally { connection.release(); }
  }

  if (method === "GET" && route === "/api/staff") {
    if (user.account_type !== "owner") return fail(response, 403, "Owner access is required.", "forbidden");
    const data = await dashboard(pool, user); return json(response, 200, { staff: data.staff, sellers: data.sellers });
  }
  if (method === "POST" && route === "/api/staff") {
    if (user.account_type !== "owner") return fail(response, 403, "Owner access is required.", "forbidden");
    const body = await readJson(request); const name = text(body.name, 120, "Full name"); const address = email(body.email); const temporaryPassword = randomToken(18);
    try {
      const hash = await bcrypt.hash(temporaryPassword, 12);
      const [result] = await pool.execute("INSERT INTO users (email,full_name,password_hash,account_type) VALUES (?,?,?,'seller')", [address,name,hash]);
      await activity(pool, user.id, "seller.created", address);
      return json(response, 201, { id: Number(result.insertId), name, email: address, temporaryPassword, accountType: "seller" });
    } catch (error) { if (error.code === "ER_DUP_ENTRY") return fail(response, 409, "An account with that email already exists.", "email_in_use"); throw error; }
  }
  const staffRoute = route.match(/^\/api\/staff\/(\d+)$/);
  if (method === "PATCH" && staffRoute) {
    if (user.account_type !== "owner") return fail(response, 403, "Owner access is required.", "forbidden");
    const body = await readJson(request); const active = body.active === true;
    const [rows] = await pool.execute("SELECT email FROM users WHERE id=? AND account_type='seller' LIMIT 1", [staffRoute[1]]);
    if (!rows.length) return fail(response, 404, "Seller account not found.", "staff_not_found");
    await pool.execute("UPDATE users SET active=? WHERE id=?", [active ? 1 : 0, staffRoute[1]]);
    if (!active) await pool.execute("DELETE FROM sessions WHERE user_id=?", [staffRoute[1]]);
    await activity(pool, user.id, active ? "seller.activated" : "seller.deactivated", rows[0].email);
    return json(response, 200, { ok: true, active });
  }
  const resetStaffRoute = route.match(/^\/api\/staff\/(\d+)\/reset-password$/);
  if (method === "POST" && resetStaffRoute) {
    if (user.account_type !== "owner") return fail(response, 403, "Owner access is required.", "forbidden");
    const [rows] = await pool.execute("SELECT id,email FROM users WHERE id=? AND account_type='seller' LIMIT 1", [resetStaffRoute[1]]);
    if (!rows.length) return fail(response, 404, "Seller account not found.", "staff_not_found");
    const temporaryPassword = randomToken(18);
    const hash = await bcrypt.hash(temporaryPassword, 12);
    await pool.execute("UPDATE users SET password_hash=? WHERE id=?", [hash, resetStaffRoute[1]]);
    await pool.execute("DELETE FROM sessions WHERE user_id=?", [resetStaffRoute[1]]);
    await activity(pool, user.id, "seller.password_reset", rows[0].email);
    return json(response, 200, { email: rows[0].email, temporaryPassword });
  }

  const inquiryRoute = route.match(/^\/api\/inquiries\/(\d+)$/);
  if (method === "PATCH" && inquiryRoute) {
    const body = await readJson(request); const status = text(body.status, 24, "Inquiry status"); const responseText = text(body.response || "", 4000, "Response", false);
    if (!new Set(["open", "processing", "resolved"]).has(status)) return fail(response, 400, "Choose a valid inquiry status.", "invalid_status");
    const [result] = await pool.execute(`UPDATE inquiries SET status=?,response=?,responded_by=? WHERE id=?${sharesStoreData(user) ? "" : " AND seller_id=?"}`, sharesStoreData(user) ? [status,responseText || null,user.id,inquiryRoute[1]] : [status,responseText || null,user.id,inquiryRoute[1],user.id]);
    if (!result.affectedRows) return fail(response, 404, "Inquiry not found.", "inquiry_not_found");
    await activity(pool, user.id, "inquiry.updated", `Inquiry ${inquiryRoute[1]}: ${status}`);
    return json(response, 200, { ok: true });
  }

  if (method === "GET" && route === "/api/activity") {
    if (user.account_type !== "owner") return fail(response, 403, "Owner access is required.", "forbidden");
    const [rows] = await pool.execute("SELECT a.id,a.event_type event,a.details,u.full_name actor,a.created_at createdAt FROM activity_logs a LEFT JOIN users u ON u.id=a.actor_user_id ORDER BY a.created_at DESC LIMIT 200");
    return json(response, 200, { activity: rows });
  }
  return false;
}

module.exports = { dispatchApi };
