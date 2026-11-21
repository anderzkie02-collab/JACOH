(() => {
  const root = document.getElementById("portal-root");
  const titles = { "/sign-in": "Account access — JACOH Apparel", "/sign-up": "Create account — JACOH Apparel", "/seller": "Seller Portal — JACOH Apparel", "/owner": "Admin Portal — JACOH Apparel" };
  const api = window.JacohAPI;
  let dashboardData = null;
  let olapData = null;
  const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const money = (value) => new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP", maximumFractionDigits: 0 }).format(Number(value) || 0).replace("PHP", "₱").replace(/\s/g, "");
  const date = (value) => value ? new Intl.DateTimeFormat("en-PH", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(value)) : "—";
  const dateTime = (value) => value ? new Intl.DateTimeFormat("en-PH", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Manila" }).format(new Date(value)) : "—";
  const logo = () => `<a class="workspace-logo" href="/" aria-label="JACOH Apparel home"><span class="wordmark-icon" aria-hidden="true">J<span>A</span></span><span class="wordmark-copy"><strong>JACOH</strong><small>OPERATIONS</small></span></a>`;
  function notify(message, id = "portal-message") {
    const node = document.getElementById(id) || document.getElementById("workspace-message");
    if (!node) return;
    node.textContent = message; node.classList.add("visible");
    clearTimeout(notify.timer); notify.timer = setTimeout(() => node.classList.remove("visible"), 5200);
  }

  const workspaceTargets = {
    overview: [".metric-grid"],
    inventory: ["#products", "#inventory", "#archived-products"],
    orders: ["#orders"],
    customers: ["#customers"],
    staff: ["#team", "#staff"],
    "stock-records": ["#stock-records"],
    inquiries: ["#inquiries"],
    activity: ["#activity"],
    reports: ["#reports", ".quick-panel"],
    analytics: ["#analytics"],
  };
  const workspaceDescriptions = {
    inventory: "Manage product listings and review stock on hand.",
    orders: "Review customer orders and update their fulfillment status.",
    customers: "Review customer history from completed store activity.",
    staff: "Manage Seller accounts and workspace access.",
    "stock-records": "Review inventory receipts and order stock movements.",
    inquiries: "Review customer messages and save a response.",
    activity: "Review the Owner audit trail.",
    reports: "Review cash-on-delivery order value and product performance.",
    analytics: "Explore a refreshed, aggregated sales data mart. COD value is not payment received.",
  };
  function imageDropField(value) {
    return `<div class="image-drop" data-image-drop><span class="image-drop-label">PRODUCT IMAGE</span>
      <label class="image-drop-zone" data-image-zone><input type="file" accept="image/jpeg,image/png,image/webp" data-image-file /><img src="${esc(value)}" alt="Product image preview" data-image-preview />
        <p><strong>Drag &amp; drop a photo here</strong><br />or click to choose a file<small>JPG, PNG or WebP · resized automatically</small></p></label>
      <input type="hidden" name="image" value="${esc(value)}" /><div class="image-drop-status" data-image-status role="status"></div></div>`;
  }
  async function shrinkImage(file) {
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) throw new Error("Choose a JPG, PNG or WebP image.");
    if (file.size > 15 * 1024 * 1024) throw new Error("That image is over 15 MB. Choose a smaller photo.");
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, 1200 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale); canvas.height = Math.round(bitmap.height * scale);
    const context = canvas.getContext("2d");
    if (file.type !== "image/png") { context.fillStyle = "#fff"; context.fillRect(0, 0, canvas.width, canvas.height); }
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const type = file.type === "image/png" ? "image/png" : "image/webp";
    let blob = await new Promise((resolve) => canvas.toBlob(resolve, type, 0.85));
    if (!blob || blob.type !== type) blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
    if (!blob || blob.size > 1900000) throw new Error("That image is still too large after resizing. Try a smaller photo.");
    return blob;
  }
  async function uploadProductImage(zone, file) {
    const box = zone.closest("[data-image-drop]"); const status = box.querySelector("[data-image-status]");
    const submit = box.closest("form")?.querySelector("[type=submit]");
    status.className = "image-drop-status"; status.textContent = "Uploading…"; if (submit) submit.disabled = true;
    try {
      const blob = await shrinkImage(file);
      const result = await api.request("/api/uploads/product-image", { method: "POST", headers: { "Content-Type": blob.type }, body: blob });
      box.querySelector("input[name=image]").value = result.path;
      box.querySelector("[data-image-preview]").src = result.path;
      status.textContent = "Image uploaded. Save the product to use it.";
    } catch (error) { status.className = "image-drop-status error"; status.textContent = error.message || "Upload failed."; }
    finally { if (submit) submit.disabled = false; }
  }
  document.addEventListener("dragover", (event) => { const zone = event.target.closest?.("[data-image-zone]"); if (zone) { event.preventDefault(); zone.classList.add("over"); } });
  document.addEventListener("dragleave", (event) => { event.target.closest?.("[data-image-zone]")?.classList.remove("over"); });
  document.addEventListener("drop", (event) => {
    const zone = event.target.closest?.("[data-image-zone]"); if (!zone) return;
    event.preventDefault(); zone.classList.remove("over");
    const file = event.dataTransfer?.files?.[0]; if (file) uploadProductImage(zone, file);
  });
  document.addEventListener("change", (event) => {
    const input = event.target; if (!input.matches?.("[data-image-file]")) return;
    const file = input.files?.[0]; if (file) uploadProductImage(input.closest("[data-image-zone]"), file);
    input.value = "";
  });

  function formField(name, label, options = {}) {
    const { type = "text", value = "", placeholder = "", required = true, min, max, step, minlength, maxlength, autocomplete } = options;
    const attrs = [`type="${esc(type)}"`, `name="${esc(name)}"`, `value="${esc(value)}"`, `placeholder="${esc(placeholder)}"`];
    if (required) attrs.push("required");
    if (min !== undefined) attrs.push(`min="${esc(min)}"`);
    if (max !== undefined) attrs.push(`max="${esc(max)}"`);
    if (step !== undefined) attrs.push(`step="${esc(step)}"`);
    if (minlength !== undefined) attrs.push(`minlength="${esc(minlength)}"`);
    if (maxlength !== undefined) attrs.push(`maxlength="${esc(maxlength)}"`);
    if (autocomplete) attrs.push(`autocomplete="${esc(autocomplete)}"`);
    return `<label class="workspace-form-field"><span>${esc(label)}</span><input ${attrs.join(" ")} /></label>`;
  }
  function textareaField(name, label, value = "", placeholder = "", required = true, maxlength = 4000, minlength = 0) {
    return `<label class="workspace-form-field workspace-form-field-wide"><span>${esc(label)}</span><textarea name="${esc(name)}" placeholder="${esc(placeholder)}" maxlength="${esc(maxlength)}" ${minlength ? `minlength="${esc(minlength)}"` : ""} ${required ? "required" : ""}>${esc(value)}</textarea></label>`;
  }
  function selectField(name, label, options, selected = "", required = true) {
    const items = options.map((item) => `<option value="${esc(item.value)}" ${String(item.value) === String(selected) ? "selected" : ""}>${esc(item.label)}</option>`).join("");
    return `<label class="workspace-form-field"><span>${esc(label)}</span><select name="${esc(name)}" ${required ? "required" : ""}>${items}</select></label>`;
  }
  function openWorkspaceForm(panelId, formType, title, description, fields, submitLabel = "SAVE") {
    const slot = root.querySelector("#workspace-form-slot");
    if (!slot) return;
    selectWorkspacePanel(panelId, true);
    slot.hidden = false;
    slot.dataset.panel = panelId;
    slot.innerHTML = `<section class="workspace-form-card"><div class="workspace-form-heading"><div><div class="eyebrow">JACOH / WORKSPACE FORM</div><h2>${esc(title)}</h2><p>${esc(description)}</p></div><button type="button" class="workspace-form-cancel" data-action="close-form" aria-label="Close form">CLOSE ×</button></div><form data-workspace-form="${esc(formType)}"><div class="workspace-form-grid">${fields}</div><div class="workspace-form-actions"><button type="button" class="workspace-form-cancel" data-action="close-form">CANCEL</button><button type="submit" class="workspace-primary">${esc(submitLabel)} <span>↗</span></button></div></form></section>`;
    slot.querySelector("input,select,textarea")?.focus({ preventScroll: true });
  }
  function closeWorkspaceForm() {
    const slot = root.querySelector("#workspace-form-slot");
    if (slot) { slot.hidden = true; slot.innerHTML = ""; delete slot.dataset.panel; }
  }
  function openStockForm(productId = "") {
    const products = dashboardData?.products || [];
    const choices = products.map((item) => ({ value: item.id, label: `${item.name} · ${item.stock} on hand` }));
    const fields = choices.length
      ? `${selectField("productId", "PRODUCT NAME", choices, productId || choices[0].value)}${formField("quantity", "QUANTITY TO RECEIVE", { type: "number", min: 1, max: 100000, step: 1, value: "1" })}${formField("reference", "REFERENCE / SUPPLIER (OPTIONAL)", { required: false, maxlength: 64, placeholder: "e.g. Supplier delivery" })}`
      : `<p class="workspace-form-empty">No active products are available to receive stock. <button type="button" class="table-action" data-action="add-product">ADD A PRODUCT ↗</button></p>`;
    openWorkspaceForm("stock-records", "stock", "RECEIVE STOCK", "Choose a product and quantity. Saving creates a stock movement that will appear below in Stock Records.", fields, "SAVE RECEIPT");
    if (!choices.length) root.querySelector('[data-workspace-form] [type="submit"]').disabled = true;
  }
  function openProductForm(productId = "") {
    const item = productId ? dashboardData?.products.find((product) => product.id === productId) : null;
    if (productId && !item) return notify("That active product could not be found.");
    const categories = [...new Set(["Hoodies", "Tees", "Outerwear", "Bottoms", "Accessories", ...(item ? [item.category] : [])])];
    const colors = item?.colors?.length ? item.colors.map((color) => `${color.name}:${color.hex}`).join(", ") : item?.color || "Black:#111111";
    const fields = `${formField("name", "PRODUCT NAME", { value: item?.name || "", maxlength: 160, placeholder: "Product name" })}${formField("sku", "SKU", { value: item?.sku || "", maxlength: 64, placeholder: "JAC-ITEM-01" })}${formField("price", "PRICE (PHP)", { type: "number", min: 1, max: 10000000, step: 1, value: item?.price ?? "" })}${selectField("category", "CATEGORY", categories.map((value) => ({ value, label: value })), item?.category || "Tees")}${formField("color", "PRIMARY COLOR", { value: item?.color || "Black", maxlength: 64 })}${formField("sizes", "SIZES (COMMA-SEPARATED)", { value: item?.sizes?.join(", ") || "S, M, L, XL", placeholder: "S, M, L, XL" })}${formField("colors", "COLOR OPTIONS (NAME:#HEX)", { value: colors, placeholder: "Black:#111111, Stone:#c2b8a8" })}${imageDropField(item?.image || "/assets/jacoh-mark.svg")}${item ? "" : formField("stock", "OPENING STOCK", { type: "number", min: 0, max: 100000, step: 1, value: "0" })}${textareaField("description", "DESCRIPTION", item?.description || "", "Product description", false)}`;
    openWorkspaceForm("inventory", item ? "product-edit" : "product-create", item ? "EDIT PRODUCT" : "ADD PRODUCT", item ? "Update product details. Use Receive Stock to change its on-hand quantity." : "Create a product listing with its first size and color options.", fields, item ? "SAVE PRODUCT" : "ADD PRODUCT");
    const form = root.querySelector("[data-workspace-form]");
    if (item && form) form.dataset.recordId = item.id;
  }
  function openPasswordForm() {
    const fields = `${formField("currentPassword", "CURRENT PASSWORD", { type: "password", autocomplete: "current-password", maxlength: 72 })}${formField("newPassword", "NEW PASSWORD (AT LEAST 8 CHARACTERS)", { type: "password", autocomplete: "new-password", minlength: 8, maxlength: 72 })}${formField("confirmPassword", "CONFIRM NEW PASSWORD", { type: "password", autocomplete: "new-password", minlength: 8, maxlength: 72 })}`;
    openWorkspaceForm(root.dataset.activeWorkspacePanel || "overview", "password", "CHANGE PASSWORD", "After saving, you will be signed out and can sign in with the new password.", fields, "UPDATE PASSWORD");
  }
  function openInviteForm() {
    const fields = `${formField("name", "SELLER FULL NAME", { maxlength: 120, autocomplete: "name" })}${formField("email", "SELLER EMAIL", { type: "email", maxlength: 254, autocomplete: "email", placeholder: "seller@example.com" })}`;
    openWorkspaceForm("staff", "invite", "INVITE SELLER", "A one-time password will be shown here after the new Seller account is created.", fields, "CREATE SELLER");
  }
  function openInquiryForm(inquiryId = "") {
    const item = inquiryId ? dashboardData?.inquiries.find((row) => String(row.id) === String(inquiryId)) : null;
    if (inquiryId && !item) return notify("That inquiry could not be found.");
    if (item) {
      const statuses = ["open", "processing", "resolved"].map((value) => ({ value, label: value.toUpperCase() }));
      openWorkspaceForm("inquiries", "inquiry-reply", `REPLY TO ${item.name}`, "Save a response and choose the inquiry status. Email delivery is not configured.", `${textareaField("response", "RESPONSE", item.response || "", "Write a response to keep with this inquiry.", false)}${selectField("status", "STATUS", statuses, item.status)}`, "SAVE RESPONSE");
      root.querySelector("[data-workspace-form]").dataset.recordId = item.id;
      return;
    }
    const productOptions = [{ value: "", label: "General / unassigned" }, ...(dashboardData?.products || []).map((product) => ({ value: product.id, label: product.name }))];
    const fields = `${formField("name", "CUSTOMER NAME", { maxlength: 120 })}${formField("email", "CUSTOMER EMAIL", { type: "email", maxlength: 254 })}${selectField("productId", "RELATED PRODUCT (OPTIONAL)", productOptions, "", false)}${formField("subject", "SUBJECT", { maxlength: 180 })}${textareaField("message", "MESSAGE", "", "Inquiry details")}`;
    openWorkspaceForm("inquiries", "inquiry-create", "NEW INQUIRY", "Save an inquiry record in this workspace. Email delivery is not configured.", fields, "SAVE INQUIRY");
  }
  function openCustomerSuspension(accountId) {
    const item = dashboardData?.customerAccounts?.find((row) => String(row.id) === String(accountId));
    if (!item) return notify("That customer account could not be found.");
    const remainingDays = item.suspensionUntil ? Math.ceil((new Date(item.suspensionUntil).getTime() - Date.now()) / 86400000) : 7;
    const durationDays = Number.isInteger(remainingDays) && remainingDays >= 1 && remainingDays <= 3650 ? remainingDays : 7;
    const durationType = item.suspensionStatus === "permanent" ? "permanent" : "temporary";
    const fields = `${selectField("suspensionType", "ACCESS RESTRICTION", [{ value: "temporary", label: "Temporary suspension" }, { value: "permanent", label: "Permanent until Owner re-enables" }], durationType)}<label class="workspace-form-field" data-suspension-duration><span>TEMPORARY DURATION (DAYS)</span><input type="number" name="durationDays" min="1" max="3650" step="1" value="${durationDays}" required /></label>${textareaField("reason", "REPORTED VIOLATION / REASON", item.suspensionReason || "", "Record the reported violation and reason for restricting this account.", true, 500, 5)}`;
    openWorkspaceForm("customers", "customer-suspension", "RESTRICT CUSTOMER ACCESS", "A suspension revokes active sessions. Temporary access returns after the selected UTC duration; permanent access remains disabled until re-enabled here.", fields, "APPLY SUSPENSION");
    const form = root.querySelector('[data-workspace-form="customer-suspension"]');
    if (form) {
      form.dataset.recordId = String(item.id);
      const durationField = form.querySelector("[data-suspension-duration]");
      const isPermanent = form.elements.suspensionType.value === "permanent";
      durationField.hidden = isPermanent;
      durationField.querySelector("input").required = !isPermanent;
    }
  }
  function showOneTimeCredentials(result, title = "SELLER ACCOUNT CREATED") {
    const slot = root.querySelector("#workspace-form-slot");
    if (!slot) return;
    slot.hidden = false;
    slot.dataset.panel = root.dataset.activeWorkspacePanel || "staff";
    slot.innerHTML = `<section class="workspace-result-card"><div><div class="eyebrow">ONE-TIME ACCOUNT DETAILS</div><h2>${esc(title)}</h2><p>Save this password securely now. It will not be shown again after leaving this screen.</p><dl><div><dt>EMAIL</dt><dd>${esc(result.email)}</dd></div><div><dt>TEMPORARY PASSWORD</dt><dd><code>${esc(result.temporaryPassword)}</code></dd></div></dl><div class="workspace-form-actions"><button type="button" class="workspace-form-cancel" data-action="close-form">DISMISS</button><button type="button" class="workspace-primary" data-action="copy-credentials" data-email="${esc(result.email)}" data-password="${esc(result.temporaryPassword)}">COPY DETAILS ↗</button></div></div></section>`;
  }
  function csvCell(value) {
    let text = String(value ?? "");
    if (typeof value !== "number" && /^[\s]*[=+\-@]/.test(text)) text = `'${text}`;
    return `"${text.replace(/"/g, '""')}"`;
  }
  function reportDate(value, withTime = false) {
    const parsed = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(parsed.getTime())) return String(value ?? "");
    const iso = parsed.toISOString();
    return withTime ? iso.slice(0, 19).replace("T", " ") : iso.slice(0, 10);
  }
  function downloadReport() {
    if (!dashboardData) return notify("Report data is not ready yet.");
    const data = dashboardData;
    const rows = [
      ["JACOH OPERATIONS REPORT"], ["Generated", new Date().toISOString()], ["Scope", data.user.accountType === "owner" ? "Owner / store-wide" : `Seller / ${data.user.name}`],
      [], ["SUMMARY"], ["Metric", "Value"], ["Order value due on delivery (PHP)", data.metrics.grossSales], ["Orders", data.metrics.orders], ["Customers", data.metrics.customers], ["Open inquiries", data.metrics.inquiries],
      [], ["DAILY ORDER VALUE - LAST 30 DAYS"], ["Date", "Order value (PHP)"], ...data.dailyRevenue.map((item) => [reportDate(item.day), item.revenue]),
      [], ["TOP PRODUCTS"], ["Product", "Units ordered"], ...data.topProducts.map((item) => [item.name, item.unitsOrdered]),
      [], ["RECENT ORDERS"], ["Order ID", "Items", "Total due (PHP)", "Status", "Created"], ...data.orders.map((item) => [item.id, item.items, item.total, item.status, reportDate(item.created_at, true)])
    ];
    const csv = "\uFEFF" + rows.map((row) => row.map(csvCell).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a"); link.href = url; link.download = `jacoh-${data.user.accountType}-report-${new Date().toISOString().slice(0, 10)}.csv`; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    notify("Your account-scoped CSV report has been downloaded.");
  }
  function renderOlap(data) {
    const panel = root.querySelector("#analytics");
    if (!panel) return;
    const labels = { day: "Day", month: "Month", category: "Category", product: "Product", seller: "Seller", status: "Order status" };
    panel.querySelector("[data-olap-group-heading]").textContent = labels[data.groupBy] || "Group";
    panel.querySelector("[data-olap-metrics]").innerHTML = `${statCard("ACTIVE ORDERS", data.totals.activeOrders, "Non-cancelled", "↗")}${statCard("CANCELLED", data.totals.cancelledOrders, "In selected period", "×")}${statCard("UNITS", data.totals.units, "Non-cancelled order lines", "▤")}${statCard("GROSS ITEM VALUE", money(data.totals.grossItemValue), "Excludes delivery / cancellations", "₱")}`;
    const rows = data.rows.length ? data.rows.map((item) => `<tr data-olap-row><td data-label="${esc(labels[data.groupBy] || "GROUP")}"><strong>${esc(item.groupLabel)}</strong></td><td data-label="ORDERS">${Number(item.activeOrders)}</td><td data-label="CANCELLED">${Number(item.cancelledOrders)}</td><td data-label="UNITS">${Number(item.units)}</td><td data-label="GROSS ITEM VALUE"><strong>${money(item.grossItemValue)}</strong></td></tr>`).join("") : `<tr><td colspan="5" class="empty-table">No saved order lines fall within this date range.</td></tr>`;
    panel.querySelector("[data-olap-rows]").innerHTML = rows;
    const refreshed = data.lastRefresh ? `Last refreshed ${dateTime(data.lastRefresh.refreshedAt)} · ${Number(data.lastRefresh.factRowCount).toLocaleString()} order lines in the mart.` : "No previous refresh is recorded.";
    panel.querySelector("[data-olap-refresh-status]").textContent = `${refreshed} ${data.measureNote}`;
    panel.querySelector('[data-action="download-olap-report"]').disabled = !data.rows.length;
  }
  async function loadOlap(refreshData = false) {
    const panel = root.querySelector("#analytics");
    if (!panel || root.dataset.workspaceRole !== "owner") return;
    const form = panel.querySelector("[data-olap-filter-form]");
    const status = panel.querySelector("[data-olap-refresh-status]");
    const runButton = form.querySelector('[type="submit"]');
    const refreshButton = panel.querySelector('[data-action="refresh-olap"]');
    runButton.disabled = true; refreshButton.disabled = true;
    status.textContent = refreshData ? "Refreshing the OLAP data mart from saved orders…" : "Loading the selected OLAP aggregation…";
    try {
      if (refreshData) await api.request("/api/olap/refresh", { method: "POST", body: "{}" });
      const params = new URLSearchParams(Object.fromEntries(new FormData(form).entries()));
      const data = await api.request(`/api/olap/summary?${params.toString()}`);
      olapData = data;
      renderOlap(data);
    } catch (error) {
      status.textContent = error.message;
    } finally {
      runButton.disabled = false; refreshButton.disabled = false;
    }
  }
  function downloadOlapReport() {
    if (!olapData) return notify("Run an OLAP analysis before downloading a report.");
    const labels = { day: "Day", month: "Month", category: "Category", product: "Product", seller: "Seller", status: "Order status" };
    const rows = [["JACOH OWNER OLAP REPORT"],["Generated",new Date().toISOString()],["Date range",`${olapData.from} to ${olapData.to}`],["Grouped by",labels[olapData.groupBy] || olapData.groupBy],["Measure",olapData.measureNote],[],[labels[olapData.groupBy] || "Group","Active orders","Cancelled orders","Units","Gross item value (PHP)"],...olapData.rows.map((item) => [item.groupLabel,item.activeOrders,item.cancelledOrders,item.units,item.grossItemValue])];
    const csv = "\uFEFF" + rows.map((row) => row.map(csvCell).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a"); link.href = url; link.download = `jacoh-owner-olap-${olapData.from}-to-${olapData.to}.csv`; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    notify("The Owner-only OLAP aggregation has been downloaded.", "workspace-message");
  }
  function selectWorkspacePanel(requestedId, updateUrl = false) {
    const links = [...root.querySelectorAll("[data-workspace-nav]")];
    const activeLink = links.find((link) => link.dataset.workspaceNav === requestedId);
    const panelId = activeLink && Object.prototype.hasOwnProperty.call(workspaceTargets, requestedId) ? requestedId : "overview";
    const formSlot = root.querySelector("#workspace-form-slot");
    if (formSlot?.dataset.panel && formSlot.dataset.panel !== panelId) closeWorkspaceForm();
    root.dataset.activeWorkspacePanel = panelId;
    const visibleNodes = new Set((workspaceTargets[panelId] || []).flatMap((selector) => [...root.querySelectorAll(selector)]));
    const managedNodes = new Set(Object.values(workspaceTargets).flat().flatMap((selector) => [...root.querySelectorAll(selector)]));
    managedNodes.forEach((node) => { node.hidden = !visibleNodes.has(node); });
    root.querySelectorAll(".dashboard-grid").forEach((grid) => {
      grid.hidden = !grid.querySelector(".dashboard-panel:not([hidden])");
    });

    links.forEach((link) => {
      const active = link === activeLink;
      link.classList.toggle("active", active);
      if (active) link.setAttribute("aria-current", "page");
      else link.removeAttribute("aria-current");
    });
    const heading = root.querySelector(".workspace-heading");
    if (heading) {
      heading.querySelector("h1").textContent = (activeLink?.dataset.workspaceLabel || "Dashboard").toUpperCase();
      const description = panelId === "overview"
        ? root.dataset.workspaceRole === "owner" ? "Your store activity at a glance." : `${root.dataset.workspaceName || "Seller"} · your seller workspace.`
        : panelId === "customers" && root.dataset.workspaceRole === "owner"
          ? "Review customer purchase history and manage registered account access."
          : workspaceDescriptions[panelId];
      if (description) heading.querySelector("p").textContent = description;
    }
    const ordersShortcut = root.querySelector('[data-action="jump-orders"]');
    if (ordersShortcut) ordersShortcut.hidden = panelId !== "overview";
    if (updateUrl && location.hash !== `#${panelId}`) {
      history.pushState({ workspacePanel: panelId }, "", `${location.pathname}${location.search}#${panelId}`);
    }
    const main = root.querySelector(".workspace-main");
    if (main) main.scrollTop = 0;
    window.scrollTo(0, 0);
    if (panelId === "analytics" && root.dataset.workspaceRole === "owner" && root.dataset.olapInitialized !== "true") {
      root.dataset.olapInitialized = "true";
      void loadOlap(true);
    }
  }

  function authPage(signUp) {
    const title = signUp ? "MAKE IT<br><em>YOURS.</em>" : "GOOD TO<br><em>SEE YOU.</em>";
    const nextParam = new URLSearchParams(location.search).get("next");
    const inquiryNext = nextParam === "/customer-inquiries" ? "?next=%2Fcustomer-inquiries" : nextParam === "/account" ? "?next=%2Faccount" : "";
    const accountSwitchPath = `${signUp ? "/sign-in" : "/sign-up"}${inquiryNext}`;
    return `<main class="auth-layout">
      <section class="auth-story">${logo()}<div class="auth-story-copy"><div class="portal-kicker"><span></span> JACOH / ACCOUNT ACCESS</div><h1>${title}</h1><p>Heavy layers. Muted tones. Your rotation, all in one place.</p><div class="auth-edition"><strong>06</strong><span>AFTER DARK<br />MEMBER ACCESS</span></div></div><div class="auth-story-footer"><span>BUILT FOR THE STREETS.</span><span>ALWAYS IN MOTION.</span></div></section>
      <section class="auth-panel"><a class="auth-back" href="/">← BACK TO THE DROP</a><div class="auth-card"><div class="eyebrow">ACCOUNT / 0${signUp ? "2" : "1"}</div><h2>${signUp ? "CREATE ACCOUNT" : "SIGN IN"}</h2><p class="auth-intro">${signUp ? "Create a customer account for your JACOH rotation." : "Sign in with your JACOH account."}</p>
        <form class="auth-form" data-auth-form="${signUp ? "signup" : "login"}">
          ${signUp ? `<label class="auth-field">FULL NAME<input name="name" autocomplete="name" maxlength="120" placeholder="Your name" required /></label>` : ""}
          <label class="auth-field">EMAIL ADDRESS<input name="email" type="email" autocomplete="email" maxlength="254" placeholder="you@example.com" required /></label>
          <label class="auth-field">PASSWORD<input name="password" type="password" autocomplete="${signUp ? "new-password" : "current-password"}" minlength="8" maxlength="128" placeholder="${signUp ? "At least 8 characters" : "Your password"}" required /></label>
          ${signUp ? `<label class="auth-field">CONFIRM PASSWORD<input name="confirmPassword" type="password" autocomplete="new-password" minlength="8" maxlength="128" placeholder="Repeat your password" required /></label>` : `<label class="auth-remember"><input type="checkbox" name="remember" /> <span>Keep me signed in</span><span class="auth-help-note">Password reset? Contact your store owner.</span></label>`}
          <button class="auth-submit" type="submit">${signUp ? "CREATE CUSTOMER ACCOUNT" : "SIGN IN"} <span>↗</span></button>
        </form><div class="portal-message" id="portal-message" role="status" aria-live="polite"></div>
        <p class="auth-switch">${signUp ? "Already have an account?" : "New to JACOH?"} <a href="${accountSwitchPath}">${signUp ? "SIGN IN" : "CREATE AN ACCOUNT"}</a></p>
        <p class="auth-panel-foot">${signUp ? "CUSTOMER ACCOUNT · SELLER ACCESS IS INVITE-ONLY" : "YOUR ACCOUNT OPENS ITS OWN WORKSPACE AFTER SIGN-IN"}</p></div></section></main>`;
  }

  function icon(mark) { return `<span class="workspace-icon" aria-hidden="true">${mark}</span>`; }
  function statusName(status) { return ({ to_pack: "To pack", processing: "Processing", ready_to_ship: "Ready to ship", completed: "Completed", cancelled: "Cancelled" })[status] || status; }
  function statCard(label, value, caption, mark) { return `<article class="metric-card">${icon(mark)}<span class="metric-label">${label}</span><strong>${value}</strong><small>${caption}</small></article>`; }
  function chartMarkup(values) {
    const days = [];
    for (let offset = 6; offset >= 0; offset--) {
      const d = new Date(); d.setUTCDate(d.getUTCDate() - offset); const key = d.toISOString().slice(0, 10);
      days.push({ key, label: new Intl.DateTimeFormat("en", { weekday: "short", timeZone: "UTC" }).format(d).slice(0, 1), amount: values.find((item) => String(item.day).slice(0, 10) === key)?.revenue || 0 });
    }
    const max = Math.max(1, ...days.map((item) => item.amount));
    return `<div class="sales-chart" role="img" aria-label="Daily revenue for the last seven days">${days.map((item) => `<div class="chart-column" title="${esc(item.key)} · ${money(item.amount)}"><span style="height:${Math.max(2, item.amount / max * 100)}%"></span><small>${item.label}</small></div>`).join("")}</div>`;
  }
  function orderRows(orders) {
    if (!orders.length) return `<tr><td colspan="6" class="empty-table">No orders yet. New cash-on-delivery checkouts will appear here.</td></tr>`;
    return orders.map((order) => `<tr data-order-row data-status="${esc(order.status)}" data-search-row="${esc(`${order.id} ${order.customer_name} ${order.items}`)}">
      <td><strong class="table-id">${esc(order.id)}</strong><small>${date(order.created_at)}</small></td><td><span class="order-item">${esc(order.items)}</span><small>${Number(order.itemQuantity)} item(s)</small></td><td>${esc(order.customer_name)}</td><td><strong>${money(order.total)}</strong></td><td><span class="status-pill status-${esc(order.status)}">${esc(statusName(order.status))}</span></td>
      <td>${order.status === "completed" || order.status === "cancelled" ? "—" : `<select aria-label="Update ${esc(order.id)} status" data-order-status="${esc(order.id)}"><option value="">UPDATE</option>${[["processing","Processing"],["ready_to_ship","Ready to ship"],["completed","Completed"],["cancelled","Cancel"]].filter(([key]) => ({to_pack:["processing","cancelled"],processing:["ready_to_ship","cancelled"],ready_to_ship:["completed"]})[order.status]?.includes(key)).map(([value,label]) => `<option value="${value}">${label}</option>`).join("")}</select>`}</td></tr>`).join("");
  }
  function productRows(products) {
    if (!products.length) return `<tr><td colspan="5" class="empty-table">No active products are assigned to this workspace yet.</td></tr>`;
    return products.map((item) => `<tr data-search-row="${esc(`${item.name} ${item.sku} ${item.category}`)}"><td data-label="PRODUCT"><div class="product-cell"><img src="${esc(item.image)}" alt="" /><div><strong>${esc(item.name)}</strong><small>${esc(item.sku)}</small></div></div></td><td data-label="PRICE">${money(item.price)}</td><td data-label="ON HAND"><strong>${Number(item.stock)}</strong> <span class="stock-unit">units</span></td><td data-label="STATUS"><span class="status-pill ${item.stock < 10 ? "status-new" : "status-done"}">${item.stock < 10 ? "LOW STOCK" : "IN STOCK"}</span></td><td data-label="ACTIONS"><button class="table-action" type="button" data-action="edit-product" data-id="${esc(item.id)}">EDIT ↗</button><button class="table-action" type="button" data-action="restock" data-id="${esc(item.id)}">STOCK +</button><button class="table-action" type="button" data-action="archive-product" data-id="${esc(item.id)}">ARCHIVE</button></td></tr>`).join("");
  }
  function archivedProductRows(products) {
    if (!products.length) return `<tr><td colspan="5" class="empty-table">Archived products will appear here. Restoring a product makes it active in the storefront again.</td></tr>`;
    return products.map((item) => `<tr data-search-row="${esc(`${item.name} ${item.sku} ${item.category}`)}"><td><div class="product-cell"><img src="${esc(item.image)}" alt="" /><div><strong>${esc(item.name)}</strong><small>${esc(item.sku)}</small></div></div></td><td>${money(item.price)}</td><td>${Number(item.stock)} <span class="stock-unit">units</span></td><td><span class="status-pill status-new">ARCHIVED</span></td><td><button class="table-action" type="button" data-action="restore-product" data-id="${esc(item.id)}">RESTORE ↗</button></td></tr>`).join("");
  }
  function customerAccessRows(accounts) {
    if (!accounts.length) return `<tr><td class="empty-table" colspan="4">No registered customer accounts.</td></tr>`;
    return accounts.map((item) => {
      const state = item.suspensionStatus;
      const label = state === "permanent" ? "PERMANENTLY SUSPENDED" : state === "temporary" ? `SUSPENDED UNTIL ${dateTime(item.suspensionUntil)}` : state === "expired" ? "TEMPORARY SUSPENSION EXPIRED · ENABLED" : "ENABLED";
      const stateClass = state === "temporary" || state === "permanent" ? "status-new" : "status-done";
      const violation = item.suspensionReason ? `${esc(item.suspensionReason)}<small>${esc(item.suspendedBy || "Owner")} · ${date(item.suspensionChangedAt)}</small>` : "—";
      const accessAction = state === "temporary" || state === "permanent"
        ? `<button class="table-action" type="button" data-action="enable-customer" data-id="${esc(item.id)}">ENABLE</button>`
        : state === "expired" ? `<button class="table-action" type="button" data-action="clear-expired-suspension" data-id="${esc(item.id)}">CLEAR EXPIRED RECORD</button>` : "";
      const suspendLabel = state === "temporary" || state === "permanent" ? "UPDATE SUSPENSION" : "SUSPEND";
      return `<tr data-customer-account-row data-search-row="${esc(`${item.name} ${item.email}`)}"><td data-label="CUSTOMER ACCOUNT"><strong>${esc(item.name)}</strong><small>${esc(item.email)} · joined ${date(item.createdAt)}</small></td><td data-label="ACCESS STATE"><span class="status-pill ${stateClass}">${label}</span></td><td data-label="REPORTED VIOLATION / REASON" class="customer-violation-cell">${violation}</td><td data-label="ACTIONS"><button class="table-action" type="button" data-action="suspend-customer" data-id="${esc(item.id)}">${suspendLabel}</button>${accessAction}</td></tr>`;
    }).join("");
  }
  function customersPanel(customers, customerAccounts = null) {
    const rows = customers.length ? customers.map((item) => `<tr><td><strong>${esc(item.name)}</strong><small>${esc(item.email)}</small></td><td>${item.orderCount}</td><td>${money(item.lifetimeSpend)}</td><td>${date(item.lastOrder)}</td></tr>`).join("") : `<tr><td class="empty-table" colspan="4">Customer order history will appear here after the first order.</td></tr>`;
    const accountSection = customerAccounts ? `<section class="customer-access-panel"><div class="customer-access-heading"><div><div class="eyebrow">OWNER / ACCOUNT ACCESS</div><h3>REGISTERED CUSTOMER ACCOUNTS</h3><p>Record reported violations when applying restrictions. Temporary suspensions expire automatically; email notifications are not configured.</p></div><div class="customer-access-tools"><input type="search" data-customer-account-search aria-label="Search registered customer accounts" placeholder="Search name or email" /><span class="customer-account-count">${customerAccounts.length} ACCOUNTS</span></div></div><div class="table-scroll customer-access-table"><table><thead><tr><th>CUSTOMER ACCOUNT</th><th>ACCESS STATE</th><th>REPORTED VIOLATION / REASON</th><th>ACTIONS</th></tr></thead><tbody>${customerAccessRows(customerAccounts)}</tbody></table></div><p class="customer-search-empty" data-customer-search-empty hidden>No registered customer accounts match that search.</p><div class="panel-footnote">SUSPENDED CUSTOMERS CANNOT SIGN IN, SEND INQUIRIES OR PLACE GUEST ORDERS USING THEIR ACCOUNT EMAIL.</div></section>` : "";
    return `<section class="dashboard-panel table-panel module-panel" id="customers"><div class="panel-heading panel-heading-table"><div><div class="eyebrow">CUSTOMER DIRECTORY</div><h2>CUSTOMERS</h2></div></div><div class="table-scroll"><table><thead><tr><th>CUSTOMER</th><th>ORDERS</th><th>LIFETIME SPEND</th><th>LAST ORDER</th></tr></thead><tbody>${rows}</tbody></table></div><div class="panel-footnote">CUSTOMER DATA FROM NON-CANCELLED STORE ORDERS</div>${accountSection}</section>`;
  }
  function stockPanel(movements) {
    const rows = movements.length ? movements.map((item) => `<tr><td>ST-${String(item.id).padStart(5,"0")}</td><td>${esc(item.productName)}<small>${esc(item.sku)}</small></td><td>${esc(item.movementType)}</td><td>${Number(item.quantityDelta) > 0 ? "+" : ""}${Number(item.quantityDelta)}</td><td>${date(item.createdAt)}</td></tr>`).join("") : `<tr><td class="empty-table" colspan="5">Stock receipts and sales will appear here.</td></tr>`;
    return `<section class="dashboard-panel table-panel module-panel" id="stock-records"><div class="panel-heading panel-heading-table"><div><div class="eyebrow">INVENTORY / MOVEMENTS</div><h2>STOCK RECORDS</h2></div><button class="panel-link" type="button" data-action="restock-pick">RECEIVE STOCK ↗</button></div><div class="table-scroll"><table><thead><tr><th>REFERENCE</th><th>PIECE</th><th>MOVEMENT</th><th>QUANTITY</th><th>DATE</th></tr></thead><tbody>${rows}</tbody></table></div><div class="panel-footnote">EVERY RECEIPT AND ORDER MOVEMENT IS RECORDED</div></section>`;
  }
  function inquiryPanel(inquiries) {
    const rows = inquiries.length ? inquiries.map((item) => `<tr><td>${esc(item.name)}<small>${esc(item.email)}</small></td><td>${esc(item.subject)}<small>${esc(item.message)}</small></td><td>${date(item.createdAt)}</td><td><span class="status-pill status-${esc(item.status)}">${esc(item.status.toUpperCase())}</span></td><td><button class="table-action" type="button" data-action="reply-inquiry" data-id="${item.id}">REPLY ↗</button></td></tr>`).join("") : `<tr><td class="empty-table" colspan="5">No customer inquiries yet.</td></tr>`;
    return `<section class="dashboard-panel table-panel module-panel" id="inquiries"><div class="panel-heading panel-heading-table"><div><div class="eyebrow">CUSTOMER CARE</div><h2>INQUIRIES</h2></div><button class="panel-link" type="button" data-action="new-inquiry">NEW INQUIRY ↗</button></div><div class="table-scroll"><table><thead><tr><th>FROM</th><th>SUBJECT / MESSAGE</th><th>RECEIVED</th><th>STATUS</th><th></th></tr></thead><tbody>${rows}</tbody></table></div><div class="panel-footnote">REPLIES ARE SAVED TO THE INQUIRY RECORD; EMAIL DELIVERY IS NOT CONFIGURED</div></section>`;
  }
  function analyticsPanel() {
    const to = new Date().toISOString().slice(0, 10);
    const from = new Date(Date.now() - 29 * 86400000).toISOString().slice(0, 10);
    return `<section class="dashboard-panel table-panel module-panel olap-module" id="analytics"><div class="panel-heading panel-heading-table"><div><div class="eyebrow">OWNER / SALES DATA MART</div><h2>OLAP ANALYTICS</h2></div><div class="olap-actions"><button class="panel-link" type="button" data-action="refresh-olap">REFRESH DATA ↻</button><button class="panel-link" type="button" data-action="download-olap-report" disabled>DOWNLOAD CSV ↗</button></div></div><p class="olap-explainer">Explore order-line data by date, product, category, Seller or order status. Refresh syncs operational orders to the analytical tables.</p><form class="olap-filter-form" data-olap-filter-form><label>FROM<input type="date" name="from" value="${from}" required /></label><label>TO<input type="date" name="to" value="${to}" required /></label><label>GROUP BY<select name="groupBy"><option value="month" selected>Month</option><option value="day">Day</option><option value="category">Category</option><option value="product">Product</option><option value="seller">Seller</option><option value="status">Order status</option></select></label><button type="submit" class="workspace-primary">RUN ANALYSIS <span>↗</span></button></form><p class="olap-refresh-status" data-olap-refresh-status role="status" aria-live="polite">Open this panel to run the first Owner-only data refresh.</p><div class="olap-metrics" data-olap-metrics><p class="empty-table">OLAP metrics will appear after refresh.</p></div><div class="table-scroll olap-table-scroll"><table><thead><tr><th data-olap-group-heading>GROUP</th><th>ORDERS</th><th>CANCELLED</th><th>UNITS</th><th>GROSS ITEM VALUE</th></tr></thead><tbody data-olap-rows><tr><td colspan="5" class="empty-table">No analytics data loaded yet.</td></tr></tbody></table></div><div class="panel-footnote">GROSS MERCHANDISE VALUE EXCLUDES CANCELLED ORDERS AND DELIVERY FEES · COD IS DUE ON DELIVERY, NOT PAID ONLINE</div></section>`;
  }
  function staffPanel(data) {
    const rows = data.staff.length ? data.staff.map((item) => `<tr><td><strong>${esc(item.name)}</strong></td><td>${esc(item.email)}</td><td>${esc(item.accountType)}</td><td><span class="status-pill ${item.active ? "status-done" : "status-new"}">${item.active ? "ACTIVE" : "DISABLED"}</span></td><td>${item.accountType === "seller" ? `<button class="table-action" type="button" data-action="reset-staff-password" data-id="${item.id}">RESET PASSWORD</button><button class="table-action" type="button" data-action="toggle-staff" data-id="${item.id}" data-active="${item.active}">${item.active ? "DISABLE" : "ENABLE"}</button>` : "—"}</td></tr>`).join("") : `<tr><td class="empty-table" colspan="5">No staff accounts.</td></tr>`;
    return `<section class="dashboard-panel table-panel module-panel" id="staff"><div class="panel-heading panel-heading-table"><div><div class="eyebrow">JACOH ACCESS</div><h2>STAFF</h2></div></div><div class="table-scroll"><table><thead><tr><th>NAME</th><th>EMAIL</th><th>ACCOUNT</th><th>ACCESS</th><th></th></tr></thead><tbody>${rows}</tbody></table></div><div class="panel-footnote">INVITE SELLERS FROM THE SELLER ACCOUNTS SECTION ABOVE. SELLER ACCESS CAN BE DISABLED HERE.</div></section>`;
  }
  function activityPanel(entries) {
    const rows = entries.length ? entries.map((item) => `<tr><td>${esc(item.event)}</td><td>${esc(item.actor || "System")}</td><td>${esc(item.details)}</td><td>${date(item.createdAt)}</td></tr>`).join("") : `<tr><td colspan="4" class="empty-table">Account, product, stock and order events will appear here.</td></tr>`;
    return `<section class="dashboard-panel table-panel module-panel" id="activity"><div class="panel-heading panel-heading-table"><div><div class="eyebrow">AUDIT TRAIL</div><h2>ACTIVITY LOGS</h2></div></div><div class="table-scroll"><table><thead><tr><th>EVENT</th><th>ACTOR</th><th>DETAIL</th><th>TIME</th></tr></thead><tbody>${rows}</tbody></table></div><div class="panel-footnote">PERSISTENT OWNER AUDIT RECORDS</div></section>`;
  }
  function sellerPanel(sellers) {
    const rows = sellers.length ? sellers.map((item) => `<tr><td><div class="seller-cell"><span class="seller-monogram">${esc(item.name.slice(0,2).toUpperCase())}</span><div><strong>${esc(item.name)}</strong><small>${esc(item.email)}</small></div></div></td><td>${item.products}</td><td>${item.orders}</td><td><strong>${money(item.sales)}</strong></td><td><span class="status-pill ${item.active ? "status-done" : "status-new"}">${item.active ? "ACTIVE" : "DISABLED"}</span></td></tr>`).join("") : `<tr><td colspan="5" class="empty-table">No seller accounts.</td></tr>`;
    return `<section class="dashboard-panel table-panel" id="team"><div class="panel-heading panel-heading-table"><div><div class="eyebrow">THE PEOPLE BEHIND THE PIECES</div><h2>SELLER ACCOUNTS</h2></div><button class="panel-link" type="button" data-action="invite-staff">INVITE SELLER ↗</button></div><div class="table-scroll"><table><thead><tr><th>SELLER</th><th>PIECES</th><th>ORDERS</th><th>SALES</th><th>STATE</th></tr></thead><tbody>${rows}</tbody></table></div><div class="panel-footnote">USE STAFF BELOW TO RESET PASSWORDS OR CHANGE ACCESS.</div></section>`;
  }
  function dashboard(data) {
    const isOwner = data.user.accountType === "owner";
    root.dataset.workspaceRole = data.user.accountType;
    root.dataset.workspaceName = data.user.name;
    const nav = isOwner ? [["overview","Dashboard","▥"],["inventory","Inventory","⬡"],["orders","Orders","▤"],["customers","Customers","♙"],["staff","Staff","♧"],["stock-records","Stock Records","▧"],["inquiries","Inquiries","▱"],["activity","Activity Logs","☷"],["analytics","OLAP Analytics","◫"],["reports","Reports","⌁"]] : [["overview","Dashboard","▥"],["inventory","Inventory","⬡"],["orders","Orders","▤"],["customers","Customers","♙"],["stock-records","Stock Records","▧"],["inquiries","Inquiries","▱"],["reports","Reports","⌁"]];
    const metric = data.metrics;
    const low = data.lowStock;
    const navLinks = nav.map(([id,label,mark],index) => `<a class="workspace-nav-link ${index===0?"active":""}" href="#${id}" data-workspace-nav="${id}" data-workspace-label="${label}" ${index===0?'aria-current="page"':""}>${icon(mark)}<span>${label}</span></a>`).join("");
    const topProducts = data.topProducts.length ? data.topProducts.map((item,index) => `<div class="stock-alert"><span class="alert-number">${String(index+1).padStart(2,"0")}</span><div><strong>${esc(item.name)}</strong><small>${item.unitsOrdered} units ordered</small></div></div>`).join("") : `<p class="empty-table">Top products appear after the first orders.</p>`;
    const lowStockRows = low.length ? low.slice(0,8).map((item) => `<div class="inventory-item"><img src="${esc(item.image)}" alt=""/><div><strong>${esc(item.name)}</strong><small>${esc(item.sku)} · ${item.stock} units left</small></div><span class="inventory-level"><i style="width:${Math.max(12,Math.min(100,item.stock*6))}%"></i></span></div>`).join("") : `<p class="empty-table">All active products are above the low-stock threshold.</p>`;
    const ownerModules = isOwner ? `${sellerPanel(data.sellers)}${staffPanel(data)}${activityPanel(data.activity)}${analyticsPanel()}` : "";
    return `<div class="workspace-layout"><aside class="workspace-sidebar">${logo()}<div class="workspace-role-label">${isOwner?"ADMIN PORTAL":"SELLER PORTAL"}<span class="preview-tag">LIVE</span></div><div class="workspace-nav-label">${isOwner?"ADMIN TOOLS":"SELLER TOOLS"}</div><nav class="workspace-nav" aria-label="${isOwner?"Admin":"Seller"} navigation">${navLinks}</nav><div class="sidebar-spacer"></div><div class="workspace-help"><span>J</span><div><strong>${esc(data.user.name)}</strong><small>${esc(data.user.email)}</small></div><b>↗</b></div><button class="sidebar-store-link" type="button" data-action="logout">← SIGN OUT</button></aside>
      <div class="workspace-main"><header class="workspace-topbar"><div class="workspace-crumb"><span>JACOH /</span> ${isOwner?"ADMIN PORTAL":"SELLER PORTAL"}</div><div class="workspace-top-actions"><span class="sample-data-label"><i></i> LIVE ACCOUNT · DATABASE SYNCED</span><button class="workspace-account-link" type="button" data-action="change-password">PASSWORD</button><button class="workspace-avatar" type="button" data-action="logout" aria-label="Sign out">${esc(data.user.name.split(/\s+/).map((x)=>x[0]).join("").slice(0,2).toUpperCase())}</button></div></header>
      <main class="workspace-content"><div class="workspace-heading" id="overview"><div><div class="portal-kicker"><span></span> JACOH APPAREL — ${isOwner?"OWNER":"SELLER"}</div><h1>DASHBOARD</h1><p>${isOwner?"Your store activity at a glance.":`${esc(data.user.name)} · your seller workspace.`}</p></div><button class="workspace-primary" type="button" data-action="jump-orders">VIEW ORDERS <span>↗</span></button></div><div id="workspace-message" class="portal-message" role="status" aria-live="polite"></div><div id="workspace-form-slot" class="workspace-form-slot" hidden></div>
      <section class="metric-grid" aria-label="Live business metrics">${statCard("ORDER VALUE",money(metric.grossSales),"Cash due on delivery","₱")}${statCard("ORDERS",metric.orders,"Store orders","↗")}${statCard("CUSTOMERS",metric.customers,"Customers with orders","♙")}${statCard("INQUIRIES",metric.inquiries,"Awaiting resolution","!")}</section>
      <div class="dashboard-grid dashboard-grid-main"><section class="dashboard-panel sales-panel" id="reports"><div class="panel-heading"><div><div class="eyebrow">ORDER VALUE OVERVIEW</div><h2>COD performance</h2></div><button type="button" class="panel-link" data-action="download-report">DOWNLOAD CSV ↗</button></div><div class="sales-total"><strong>${money(metric.grossSales)}</strong></div>${chartMarkup(data.dailyRevenue)}<div class="chart-foot"><span>LAST 30 DAYS AVAILABLE IN CSV</span><span>ORDER VALUE · NOT PAYMENT RECEIVED</span><span>PHP</span></div></section><section class="dashboard-panel quick-panel"><div class="panel-heading"><div><div class="eyebrow">TOP ORDERED PRODUCTS</div><h2>By order quantity</h2></div><a href="#orders" class="panel-link">VIEW ORDERS ↗</a></div>${topProducts}</section></div>
      <section class="dashboard-panel table-panel" id="orders"><div class="panel-heading panel-heading-table"><div><div class="eyebrow">${isOwner?"ADMIN / STORE ACTIVITY":"SELLER / STORE ACTIVITY"}</div><h2>RECENT ORDERS</h2></div><div class="table-tools"><input type="search" data-dashboard-search placeholder="Search orders" aria-label="Search orders" /></div></div><div class="order-filters" role="group" aria-label="Filter orders"><button class="active" type="button" data-order-filter="all">ALL</button><button type="button" data-order-filter="to_pack">TO PACK</button><button type="button" data-order-filter="processing">PROCESSING</button><button type="button" data-order-filter="completed">COMPLETED</button></div><div class="table-scroll"><table><thead><tr><th>ORDER</th><th>PIECE</th><th>CUSTOMER</th><th>TOTAL</th><th>STATUS</th><th>UPDATE</th></tr></thead><tbody>${orderRows(data.orders)}</tbody></table></div><div class="panel-footnote">ORDERS AND INVENTORY UPDATE LIVE</div></section>
      <div class="dashboard-grid dashboard-grid-secondary"><section class="dashboard-panel table-panel active-products-panel" id="products"><div class="panel-heading panel-heading-table"><div><div class="eyebrow">ACTIVE LISTINGS</div><h2>PRODUCTS</h2></div><button class="panel-link" type="button" data-action="add-product">ADD PRODUCT ↗</button></div><div class="table-scroll"><table><thead><tr><th>PIECE</th><th>PRICE</th><th>ON HAND</th><th>STATUS</th><th>ACTIONS</th></tr></thead><tbody>${productRows(data.products)}</tbody></table></div><div class="panel-footnote">PRODUCT RECORDS AND STOCK ARE SAVED IN THE DATABASE</div></section></div>
      ${isOwner?`<section class="dashboard-panel table-panel owner-inventory" id="inventory"><div class="panel-heading panel-heading-table"><div><div class="eyebrow">NETWORK-WIDE STOCK</div><h2>INVENTORY WATCH</h2></div><button class="panel-link" type="button" data-action="restock-pick">RECEIVE STOCK ↗</button></div><div class="inventory-list">${lowStockRows}</div></section>`:""}
      <section class="dashboard-panel table-panel module-panel" id="archived-products"><div class="panel-heading panel-heading-table"><div><div class="eyebrow">INVENTORY / ARCHIVE</div><h2>ARCHIVED PRODUCTS</h2></div></div><div class="table-scroll"><table><thead><tr><th>PIECE</th><th>PRICE</th><th>ON HAND</th><th>STATUS</th><th>ACTIONS</th></tr></thead><tbody>${archivedProductRows(data.archivedProducts || [])}</tbody></table></div><div class="panel-footnote">RESTORING A PRODUCT MAKES IT ACTIVE IN THE STOREFRONT AGAIN.</div></section>
      ${customersPanel(data.customers, isOwner ? (data.customerAccounts || []) : null)}${stockPanel(data.stockMovements)}${inquiryPanel(data.inquiries)}${ownerModules}
      <footer class="workspace-footer"><span>JACOH / OPERATIONS</span><span>LIVE DATABASE · ${esc(data.user.accountType.toUpperCase())} ACCOUNT</span><a href="/">BACK TO SHOP ↑</a></footer></main></div></div>`;
  }

  async function route() {
    const pathname = window.location.pathname.replace(/\/+$/, "") || "/";
    const title = titles[pathname];
    if (!title) { document.body.classList.remove("portal-active"); root.hidden = true; return; }
    document.body.classList.add("portal-active"); root.hidden = false; document.title = title;
    if (pathname === "/sign-in" || pathname === "/sign-up") {
      root.innerHTML = authPage(pathname === "/sign-up");
      try {
        await api.csrf();
        const session = await api.request("/api/auth/me");
        if (session.user.accountType === "owner") window.location.replace("/owner");
        else if (session.user.accountType === "seller") window.location.replace("/seller");
        else window.location.replace("/");
      } catch (error) { if (error.status !== 401) notify(error.message); }
      return;
    }
    root.innerHTML = `<main class="auth-layout"><section class="auth-panel"><div class="auth-card"><h2>LOADING WORKSPACE</h2><p>Checking your account…</p></div></section></main>`;
    try {
      const session = await api.request("/api/auth/me");
      const expected = pathname === "/owner" ? "owner" : "seller";
      if (session.user.accountType !== expected) { window.location.replace(session.user.accountType === "owner" ? "/owner" : session.user.accountType === "seller" ? "/seller" : "/"); return; }
      const data = await api.request("/api/dashboard");
      dashboardData = data;
      root.innerHTML = dashboard(data);
      selectWorkspacePanel(location.hash.slice(1) || "overview");
    } catch (error) {
      if (error.status === 401) { window.location.replace("/sign-in"); return; }
      root.innerHTML = `<main class="auth-layout"><section class="auth-panel"><div class="auth-card"><h2>WORKSPACE UNAVAILABLE</h2><p>${esc(error.message)}</p><a class="auth-submit" href="/sign-in">RETURN TO SIGN IN</a></div></section></main>`;
    }
  }

  root.addEventListener("submit", async (event) => {
    const form = event.target.closest("[data-auth-form]");
    if (!form) return;
    event.preventDefault(); if (!form.reportValidity()) return;
    if (form.dataset.authForm === "signup" && form.elements.password.value !== form.elements.confirmPassword.value) { notify("Those passwords do not match."); form.elements.confirmPassword.focus(); return; }
    const submit = form.querySelector("[type=submit]"); submit.disabled = true;
    try {
      const data = form.dataset.authForm === "login"
        ? await api.request("/api/auth/login", { method: "POST", body: JSON.stringify({ email: form.elements.email.value, password: form.elements.password.value, remember: form.elements.remember.checked }) })
        : await api.request("/api/auth/signup", { method: "POST", body: JSON.stringify({ name: form.elements.name.value, email: form.elements.email.value, password: form.elements.password.value }) });
      const next = new URLSearchParams(location.search).get("next");
      window.location.assign(data.user?.accountType === "customer" && (next === "/customer-inquiries" || next === "/account") ? next : data.redirect);
    } catch (error) { form.elements.password.value = ""; notify(error.message); submit.disabled = false; }
  });

  async function refreshDashboard(message, selectedPanel) {
    const currentPanel = selectedPanel || root.querySelector(".workspace-nav-link.active")?.dataset.workspaceNav || "overview";
    const data = await api.request("/api/dashboard"); dashboardData = data; root.innerHTML = dashboard(data);
    selectWorkspacePanel(currentPanel);
    if (message) notify(message, "workspace-message");
  }

  root.addEventListener("submit", async (event) => {
    const olapForm = event.target.closest("[data-olap-filter-form]");
    if (olapForm) { event.preventDefault(); if (olapForm.reportValidity()) await loadOlap(false); return; }
    const form = event.target.closest("[data-workspace-form]");
    if (!form) return;
    event.preventDefault(); if (!form.reportValidity()) return;
    const submit = form.querySelector('[type="submit"]'); if (submit) submit.disabled = true;
    const values = Object.fromEntries(new FormData(form).entries());
    try {
      if (form.dataset.workspaceForm === "stock") {
        await api.request(`/api/products/${encodeURIComponent(values.productId)}/stock`, { method: "POST", body: JSON.stringify({ quantity: Number(values.quantity), reference: values.reference }) });
        await refreshDashboard("Stock received and recorded.", "stock-records"); return;
      }
      if (form.dataset.workspaceForm === "product-create" || form.dataset.workspaceForm === "product-edit") {
        const colorOptions = values.colors.split(",").map((entry) => {
          const [name, ...hexParts] = entry.split(":"); const hex = hexParts.join(":").trim();
          return { name: name.trim(), hex: /^#[0-9a-f]{6}$/i.test(hex) ? hex : "#111111" };
        }).filter((item) => item.name);
        const product = { name: values.name, sku: values.sku, price: Number(values.price), category: values.category, color: values.color, image: values.image, description: values.description, sizes: values.sizes.split(",").map((value) => value.trim()).filter(Boolean), colors: colorOptions };
        if (form.dataset.workspaceForm === "product-create") {
          product.id = values.sku.toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
          product.stock = Number(values.stock);
          await api.request("/api/products", { method: "POST", body: JSON.stringify(product) });
          await refreshDashboard("Product added to the catalog.", "inventory");
        } else {
          await api.request(`/api/products/${encodeURIComponent(form.dataset.recordId)}`, { method: "PUT", body: JSON.stringify(product) });
          await refreshDashboard("Product details saved.", "inventory");
        }
        return;
      }
      if (form.dataset.workspaceForm === "password") {
        if (values.newPassword !== values.confirmPassword) { notify("Those passwords do not match.", "workspace-message"); form.elements.confirmPassword.focus(); return; }
        await api.request("/api/auth/password", { method: "POST", body: JSON.stringify({ currentPassword: values.currentPassword, newPassword: values.newPassword }) });
        window.location.assign("/sign-in"); return;
      }
      if (form.dataset.workspaceForm === "invite") {
        const created = await api.request("/api/staff", { method: "POST", body: JSON.stringify({ name: values.name, email: values.email }) });
        showOneTimeCredentials(created);
        await refreshDashboard("Seller account created.", "staff"); showOneTimeCredentials(created); return;
      }
      if (form.dataset.workspaceForm === "inquiry-reply") {
        await api.request(`/api/inquiries/${encodeURIComponent(form.dataset.recordId)}`, { method: "PATCH", body: JSON.stringify({ response: values.response, status: values.status }) });
        await refreshDashboard("Inquiry update saved.", "inquiries"); return;
      }
      if (form.dataset.workspaceForm === "inquiry-create") {
        await api.request("/api/inquiries", { method: "POST", body: JSON.stringify({ name: values.name, email: values.email, subject: values.subject, message: values.message, productId: values.productId || undefined }) });
        await refreshDashboard("Inquiry saved.", "inquiries"); return;
      }
      if (form.dataset.workspaceForm === "customer-suspension") {
        const permanent = values.suspensionType === "permanent";
        await api.request(`/api/customer-accounts/${encodeURIComponent(form.dataset.recordId)}`, { method: "PATCH", body: JSON.stringify({ action: "suspend", permanent, durationDays: permanent ? undefined : Number(values.durationDays), reason: values.reason }) });
        await refreshDashboard(permanent ? "Customer account permanently suspended." : "Customer account temporarily suspended.", "customers"); return;
      }
    } catch (error) { notify(error.message, "workspace-message"); }
    finally { if (submit?.isConnected) submit.disabled = false; }
  });

  root.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-action]"); if (!button) return;
    const action = button.dataset.action;
    try {
      if (action === "logout") { await api.request("/api/auth/logout", { method: "POST", body: "{}" }); window.location.assign("/"); return; }
      if (action === "jump-orders") { selectWorkspacePanel("orders", true); return; }
      if (action === "close-form") { closeWorkspaceForm(); return; }
      if (action === "copy-credentials") {
        const text = `Email: ${button.dataset.email}\nTemporary password: ${button.dataset.password}`;
        if (!navigator.clipboard?.writeText) return notify("Clipboard access is unavailable. Copy the details from this one-time card.", "workspace-message");
        await navigator.clipboard.writeText(text); notify("One-time account details copied.", "workspace-message"); return;
      }
      if (action === "download-report") { downloadReport(); return; }
      if (action === "refresh-olap") { await loadOlap(true); return; }
      if (action === "download-olap-report") { downloadOlapReport(); return; }
      if (action === "restock-pick" || action === "restock") { openStockForm(button.dataset.id || ""); return; }
      if (action === "edit-product") { openProductForm(button.dataset.id); return; }
      if (action === "archive-product") {
        if (!window.confirm("Archive this product from the storefront? Past order records will remain.")) return;
        await api.request(`/api/products/${encodeURIComponent(button.dataset.id)}`, { method: "DELETE", body: "{}" }); await refreshDashboard("Product archived.", "inventory"); return;
      }
      if (action === "restore-product") {
        await api.request(`/api/products/${encodeURIComponent(button.dataset.id)}/restore`, { method: "POST", body: "{}" }); await refreshDashboard("Product restored to the active catalog.", "inventory"); return;
      }
      if (action === "add-product") { openProductForm(); return; }
      if (action === "change-password") { openPasswordForm(); return; }
      if (action === "invite-staff") { openInviteForm(); return; }
      if (action === "reset-staff-password") {
        if (!window.confirm("Replace this seller's password and revoke their active sessions? Their current access will stop immediately.")) return;
        const reset = await api.request(`/api/staff/${button.dataset.id}/reset-password`, { method: "POST", body: "{}" });
        showOneTimeCredentials(reset, "SELLER PASSWORD RESET");
        await refreshDashboard("Seller password reset. Save the one-time password securely.", "staff"); showOneTimeCredentials(reset, "SELLER PASSWORD RESET"); return;
      }
      if (action === "toggle-staff") {
        const enabled = button.dataset.active !== "true";
        if (!window.confirm(`${enabled ? "Enable" : "Disable"} this seller account? ${enabled ? "" : "Their active sessions will be revoked."}`)) return;
        await api.request(`/api/staff/${button.dataset.id}`, { method: "PATCH", body: JSON.stringify({ active: enabled }) }); await refreshDashboard(enabled ? "Seller account enabled." : "Seller account disabled."); return;
      }
      if (action === "suspend-customer") { openCustomerSuspension(button.dataset.id); return; }
      if (action === "enable-customer" || action === "clear-expired-suspension") {
        await api.request(`/api/customer-accounts/${encodeURIComponent(button.dataset.id)}`, { method: "PATCH", body: JSON.stringify({ action: "enable" }) });
        await refreshDashboard(action === "enable-customer" ? "Customer account re-enabled." : "Expired suspension record cleared; account remains enabled.", "customers"); return;
      }
      if (action === "reply-inquiry") { openInquiryForm(button.dataset.id); return; }
      if (action === "new-inquiry") { openInquiryForm(); return; }
    } catch (error) { notify(error.message, "workspace-message"); }
  });

  root.addEventListener("change", async (event) => {
    const suspensionType = event.target.closest('[name="suspensionType"]');
    if (suspensionType) {
      const durationField = root.querySelector("[data-suspension-duration]");
      if (durationField) { const temporary = suspensionType.value === "temporary"; durationField.hidden = !temporary; durationField.querySelector("input").required = temporary; }
      return;
    }
    const status = event.target.closest("[data-order-status]");
    if (status && status.value) {
      try { await api.request(`/api/orders/${encodeURIComponent(status.dataset.orderStatus)}/status`, { method: "PATCH", body: JSON.stringify({ status: status.value }) }); await refreshDashboard("Order status updated."); }
      catch (error) { notify(error.message, "workspace-message"); }
    }
  });
  root.addEventListener("click", (event) => {
    const filter = event.target.closest("[data-order-filter]");
    if (filter) {
      root.querySelectorAll("[data-order-filter]").forEach((item) => item.classList.toggle("active", item === filter));
      root.querySelectorAll("[data-order-row]").forEach((row) => { row.hidden = filter.dataset.orderFilter !== "all" && row.dataset.status !== filter.dataset.orderFilter; });
    }
    const navLink = event.target.closest("[data-workspace-nav]");
    const panelLink = event.target.closest('a[href^="#"]');
    if (navLink || (panelLink && root.contains(panelLink))) {
      event.preventDefault();
      selectWorkspacePanel(navLink?.dataset.workspaceNav || panelLink.hash.slice(1), true);
    }
  });
  root.addEventListener("input", (event) => {
    const accountSearch = event.target.closest("[data-customer-account-search]");
    if (accountSearch) {
      const term = accountSearch.value.trim().toLocaleLowerCase();
      const rows = [...root.querySelectorAll("[data-customer-account-row]")];
      rows.forEach((row) => { row.hidden = !row.dataset.searchRow.toLocaleLowerCase().includes(term); });
      const empty = root.querySelector("[data-customer-search-empty]");
      if (empty) empty.hidden = rows.length === 0 || rows.some((row) => !row.hidden);
    }
    if (!event.target.matches("[data-dashboard-search]")) return;
    const term = event.target.value.trim().toLowerCase(); event.target.closest("#orders")?.querySelectorAll("[data-search-row]").forEach((row) => { row.hidden = !row.dataset.searchRow.toLowerCase().includes(term); });
  });
  window.addEventListener("popstate", route);
  route();
})();
