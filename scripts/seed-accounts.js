const crypto = require("node:crypto");
const bcrypt = require("bcryptjs");
const { createPool, ensureSchema } = require("../db");

const products = [
  { id: "afterdark-hoodie", sku: "JAC-ADH-01", name: "Afterdark Heavyweight Hoodie", category: "Hoodies", color: "Washed Black", price: 2190, stock: 8, image: "/manus-storage/afterdark-hoodie_867b1c47.jpg", sizes: ["S", "M", "L", "XL"], colors: [{ name: "Washed Black", hex: "#393a37" }, { name: "Olive", hex: "#65704f" }, { name: "Burgundy", hex: "#6d1f2b" }, { name: "Stone", hex: "#c9c4b8" }], description: "A heavyweight fleece layer with a washed finish, dropped shoulders and an easy, oversized fit. Built to stay out after the city winds down." },
  { id: "district-jacket", sku: "JAC-DUJ-02", name: "District Utility Jacket", category: "Outerwear", color: "Stone", price: 2890, stock: 16, image: "/manus-storage/district-utility-jacket_014c7b45.jpg", sizes: ["S", "M", "L", "XL"], colors: [{ name: "Stone", hex: "#cfc9bb" }, { name: "Black", hex: "#111111" }, { name: "Olive", hex: "#59634d" }], description: "A city-ready layer with utilitarian lines and a relaxed silhouette. Made for changing weather, late rides and everyday wear." },
  { id: "core-tee", sku: "JAC-CLR-03", name: "Core Logo Relaxed Tee", category: "Tees", color: "Optic White", price: 990, stock: 32, image: "/manus-storage/core-logo-tee_20de7f9b.jpg", sizes: ["S", "M", "L", "XL"], colors: [{ name: "Optic White", hex: "#f5f3ed" }, { name: "Black", hex: "#111111" }, { name: "Sage", hex: "#89947a" }, { name: "Navy", hex: "#1f2a44" }], description: "An everyday cotton tee with a roomier cut and clean JACOH branding. The one you reach for when the fit does the talking." },
  { id: "transit-set", sku: "JAC-TFS-04", name: "Transit Fleece Set", category: "Bottoms", color: "Concrete", price: 2490, stock: 17, image: "/manus-storage/transit-fleece-set_97bce24b.jpg", sizes: ["S", "M", "L", "XL"], colors: [{ name: "Concrete", hex: "#bcbdb9" }, { name: "Black", hex: "#111111" }, { name: "Navy", hex: "#1f2a44" }], description: "A soft fleece co-ord with an easy, off-duty feel. Relaxed through the leg and made to move from the block to the ride home." },
  { id: "static-tee", sku: "JAC-SGT-05", name: "Static Graphic Tee", category: "Tees", color: "Black", price: 1190, stock: 32, image: "/manus-storage/static-graphic-tee_26bbe44d.jpg", sizes: ["S", "M", "L", "XL"], colors: [{ name: "Black", hex: "#111111" }, { name: "Optic White", hex: "#f5f3ed" }, { name: "Sage", hex: "#89947a" }], description: "A relaxed graphic tee with a little noise in all the right places. Midweight cotton, built for repeat rotation." },
  { id: "cargo-pants", sku: "JAC-CUP-06", name: "Cargo Utility Pants", category: "Bottoms", color: "Olive", price: 2390, stock: 3, image: "/manus-storage/cargo-utility-pants_eb979911.jpg", sizes: ["S", "M", "L", "XL"], colors: [{ name: "Olive", hex: "#626a4d" }, { name: "Black", hex: "#111111" }, { name: "Khaki", hex: "#b8a77a" }, { name: "Stone", hex: "#cfc9bb" }], description: "A loose utility fit with practical pocketing and a clean taper. Room to move, built for the long route." },
  { id: "nightshift-joggers", sku: "JAC-NSJ-07", name: "Nightshift Joggers", category: "Bottoms", color: "Black", price: 1790, stock: 28, image: "/manus-storage/nightshift-joggers_553d5f64.jpg", sizes: ["S", "M", "L", "XL"], colors: [{ name: "Black", hex: "#111111" }, { name: "Charcoal", hex: "#444541" }, { name: "Navy", hex: "#1f2a44" }], description: "A soft, easy jogger with a tapered leg and all-day comfort. The low-key foundation for a late-night uniform." },
  { id: "box-crewneck", sku: "JAC-BLC-08", name: "Box Logo Crewneck", category: "Hoodies", color: "Bone", price: 1890, stock: 19, image: "/manus-storage/box-logo-crewneck_214e598e.jpg", sizes: ["S", "M", "L", "XL"], colors: [{ name: "Bone", hex: "#e8e2d4" }, { name: "Black", hex: "#111111" }, { name: "Burgundy", hex: "#6d1f2b" }], description: "A brushed crewneck with a boxy cut and soft, worn-in hand feel. Made for cool nights and familiar corners." },
  { id: "coach-windbreaker", sku: "JAC-CWB-09", name: "Coach Windbreaker", category: "Outerwear", color: "Navy", price: 2590, stock: 10, image: "/manus-storage/coach-windbreaker_b0259104.jpg", sizes: ["S", "M", "L", "XL"], colors: [{ name: "Navy", hex: "#1f2a44" }, { name: "Black", hex: "#111111" }, { name: "Sand", hex: "#d8c7a3" }], description: "A light shell for unpredictable nights. Easy to layer, packs down without fuss, and keeps the look sharp." },
  { id: "washed-cap", sku: "JAC-WDC-10", name: "Washed Dad Cap", category: "Accessories", color: "Black", price: 790, stock: 40, image: "/manus-storage/washed-dad-cap_243c5826.jpg", sizes: ["One Size"], colors: [{ name: "Black", hex: "#111111" }, { name: "Khaki", hex: "#b8a77a" }, { name: "Olive", hex: "#626a4d" }, { name: "Optic White", hex: "#f5f3ed" }], description: "A washed cotton cap with a curved brim and adjustable back strap. One size, every day." }
];

async function main() {
  const pool = createPool();
  try {
    await ensureSchema(pool);
    const [existing] = await pool.execute("SELECT email FROM users WHERE email IN (?,?)", ["owner@jacoh.ph", "staff@jacoh.ph"]);
    if (existing.length) throw new Error("One or both requested account emails already exist; refusing to overwrite existing credentials.");
    const [existingProducts] = await pool.execute("SELECT id FROM products WHERE id IN (" + products.map(() => "?").join(",") + ")", products.map((item) => item.id));
    if (existingProducts.length) throw new Error("One or more starter product IDs already exist; refusing to overwrite inventory.");
    const ownerPassword = crypto.randomBytes(24).toString("base64url");
    const sellerPassword = crypto.randomBytes(24).toString("base64url");
    const ownerHash = await bcrypt.hash(ownerPassword, 12);
    const sellerHash = await bcrypt.hash(sellerPassword, 12);
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      const [owner] = await connection.execute("INSERT INTO users (email,full_name,password_hash,account_type) VALUES (?,?,?,'owner')", ["owner@jacoh.ph", "JACOH Owner", ownerHash]);
      const [seller] = await connection.execute("INSERT INTO users (email,full_name,password_hash,account_type) VALUES (?,?,?,'seller')", ["staff@jacoh.ph", "Mara Villanueva", sellerHash]);
      for (const item of products) {
        await connection.execute(
          "INSERT INTO products (id,seller_id,sku,name,description,category,color,price,image,sizes,colors,stock) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
          [item.id, seller.insertId, item.sku, item.name, item.description, item.category, item.color, item.price, item.image, JSON.stringify(item.sizes), JSON.stringify(item.colors), item.stock]
        );
        await connection.execute("INSERT INTO stock_movements (product_id,seller_id,actor_user_id,movement_type,quantity_delta,reference_id) VALUES (?,?,?,'opening',?,?)", [item.id, seller.insertId, owner.insertId, item.stock, "opening-inventory"]);
      }
      await connection.execute("INSERT INTO activity_logs (actor_user_id,event_type,details) VALUES (?, 'accounts.seeded', 'Owner and Seller accounts and the initial Drop 06 catalog were created')", [owner.insertId]);
      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally { connection.release(); }
    process.stdout.write(JSON.stringify({
      owner: { email: "owner@jacoh.ph", password: ownerPassword, accountType: "owner" },
      seller: { email: "staff@jacoh.ph", password: sellerPassword, accountType: "seller" },
      catalogProducts: products.length,
      note: "Save these initial passwords securely. They are displayed once and are not stored in plaintext."
    }, null, 2) + "\n");
  } finally { await pool.end(); }
}

main().catch((error) => {
  console.error("Account bootstrap failed:", error.message);
  process.exitCode = 1;
});
