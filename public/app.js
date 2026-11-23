let products = [
  {
    id: "afterdark-hoodie", name: "Afterdark Heavyweight Hoodie", category: "Hoodies", color: "Washed Black", price: 2190, stock: 8,
    image: "/manus-storage/afterdark-hoodie_867b1c47.jpg", sizes: ["S", "M", "L", "XL"],
    colors: [{ name: "Washed Black", hex: "#393a37" }, { name: "Olive", hex: "#65704f" }, { name: "Burgundy", hex: "#6d1f2b" }, { name: "Stone", hex: "#c9c4b8" }],
    description: "A heavyweight fleece layer with a washed finish, dropped shoulders and an easy, oversized fit. Built to stay out after the city winds down."
  },
  {
    id: "district-jacket", name: "District Utility Jacket", category: "Outerwear", color: "Stone", price: 2890,
    image: "/manus-storage/district-utility-jacket_014c7b45.jpg", sizes: ["S", "M", "L", "XL"],
    colors: [{ name: "Stone", hex: "#cfc9bb" }, { name: "Black", hex: "#111111" }, { name: "Olive", hex: "#59634d" }],
    description: "A city-ready layer with utilitarian lines and a relaxed silhouette. Made for changing weather, late rides and everyday wear."
  },
  {
    id: "core-tee", name: "Core Logo Relaxed Tee", category: "Tees", color: "Optic White", price: 990,
    image: "/manus-storage/core-logo-tee_20de7f9b.jpg", sizes: ["S", "M", "L", "XL"],
    colors: [{ name: "Optic White", hex: "#f5f3ed" }, { name: "Black", hex: "#111111" }, { name: "Sage", hex: "#89947a" }, { name: "Navy", hex: "#1f2a44" }],
    description: "An everyday cotton tee with a roomier cut and clean JACOH branding. The one you reach for when the fit does the talking."
  },
  {
    id: "transit-set", name: "Transit Fleece Set", category: "Bottoms", color: "Concrete", price: 2490,
    image: "/manus-storage/transit-fleece-set_97bce24b.jpg", sizes: ["S", "M", "L", "XL"],
    colors: [{ name: "Concrete", hex: "#bcbdb9" }, { name: "Black", hex: "#111111" }, { name: "Navy", hex: "#1f2a44" }],
    description: "A soft fleece co-ord with an easy, off-duty feel. Relaxed through the leg and made to move from the block to the ride home."
  },
  {
    id: "static-tee", name: "Static Graphic Tee", category: "Tees", color: "Black", price: 1190,
    image: "/manus-storage/static-graphic-tee_26bbe44d.jpg", sizes: ["S", "M", "L", "XL"],
    colors: [{ name: "Black", hex: "#111111" }, { name: "Optic White", hex: "#f5f3ed" }, { name: "Sage", hex: "#89947a" }],
    description: "A relaxed graphic tee with a little noise in all the right places. Midweight cotton, built for repeat rotation."
  },
  {
    id: "cargo-pants", name: "Cargo Utility Pants", category: "Bottoms", color: "Olive", price: 2390,
    image: "/manus-storage/cargo-utility-pants_eb979911.jpg", sizes: ["S", "M", "L", "XL"],
    colors: [{ name: "Olive", hex: "#626a4d" }, { name: "Black", hex: "#111111" }, { name: "Khaki", hex: "#b8a77a" }, { name: "Stone", hex: "#cfc9bb" }],
    description: "A loose utility fit with practical pocketing and a clean taper. Room to move, built for the long route."
  },
  {
    id: "nightshift-joggers", name: "Nightshift Joggers", category: "Bottoms", color: "Black", price: 1790,
    image: "/manus-storage/nightshift-joggers_553d5f64.jpg", sizes: ["S", "M", "L", "XL"],
    colors: [{ name: "Black", hex: "#111111" }, { name: "Charcoal", hex: "#444541" }, { name: "Navy", hex: "#1f2a44" }],
    description: "A soft, easy jogger with a tapered leg and all-day comfort. The low-key foundation for a late-night uniform."
  },
  {
    id: "box-crewneck", name: "Box Logo Crewneck", category: "Hoodies", color: "Bone", price: 1890,
    image: "/manus-storage/box-logo-crewneck_214e598e.jpg", sizes: ["S", "M", "L", "XL"],
    colors: [{ name: "Bone", hex: "#e8e2d4" }, { name: "Black", hex: "#111111" }, { name: "Burgundy", hex: "#6d1f2b" }],
    description: "A brushed crewneck with a boxy cut and soft, worn-in hand feel. Made for cool nights and familiar corners."
  },
  {
    id: "coach-windbreaker", name: "Coach Windbreaker", category: "Outerwear", color: "Navy", price: 2590,
    image: "/manus-storage/coach-windbreaker_b0259104.jpg", sizes: ["S", "M", "L", "XL"],
    colors: [{ name: "Navy", hex: "#1f2a44" }, { name: "Black", hex: "#111111" }, { name: "Sand", hex: "#d8c7a3" }],
    description: "A light shell for unpredictable nights. Easy to layer, packs down without fuss, and keeps the look sharp."
  },
  {
    id: "washed-cap", name: "Washed Dad Cap", category: "Accessories", color: "Black", price: 790,
    image: "/manus-storage/washed-dad-cap_243c5826.jpg", sizes: ["One Size"],
    colors: [{ name: "Black", hex: "#111111" }, { name: "Khaki", hex: "#b8a77a" }, { name: "Olive", hex: "#626a4d" }, { name: "Optic White", hex: "#f5f3ed" }],
    description: "A washed cotton cap with a curved brim and adjustable back strap. One size, every day."
  }
];

const FREE_DELIVERY = 3500;
const DELIVERY_FEE = 120;
const money = new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP", maximumFractionDigits: 0 });
const formatMoney = (amount) => money.format(amount).replace("PHP", "₱").replace(/\s/g, "");
function newCheckoutReference() {
  if (window.crypto?.randomUUID) return window.crypto.randomUUID();
  const bytes = new Uint8Array(24);
  window.crypto.getRandomValues(bytes);
  return Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
}
let savedCheckoutReference = "";
try { savedCheckoutReference = sessionStorage.getItem("jacoh-checkout-reference") || ""; } catch { /* Session storage may be unavailable in a restricted browser. */ }
const state = {
  filter: "All",
  query: "",
  catalogReady: false,
  catalogError: false,
  selections: Object.fromEntries(products.map((product) => [product.id, { color: product.color, size: product.sizes.length === 1 ? product.sizes[0] : "" }])),
  cart: loadCart(),
  pendingOrderReference: savedCheckoutReference || newCheckoutReference()
};
try { sessionStorage.setItem("jacoh-checkout-reference", state.pendingOrderReference); } catch { /* The in-memory key still protects this page session. */ }

function loadCart() {
  try {
    const saved = JSON.parse(localStorage.getItem("jacoh-bag") || "[]");
    // Only check the shape here: the live catalog has not loaded yet, so loadCatalog() removes items for products that no longer exist.
    return Array.isArray(saved) ? saved.filter((item) => item && typeof item.id === "string" && Number(item.quantity) > 0) : [];
  } catch {
    return [];
  }
}

function persistCart() {
  localStorage.setItem("jacoh-bag", JSON.stringify(state.cart));
}

function productById(id) {
  return products.find((product) => product.id === id);
}

function escapeHTML(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
}

function renderColorOptions(product, scope) {
  const selectedColor = state.selections[product.id]?.color || product.color;
  return `<div class="color-options" role="group" aria-label="Choose a color">${product.colors.map((color) => `
    <button class="color-swatch ${selectedColor === color.name ? "selected" : ""}" type="button" data-action="color" data-scope="${scope}" data-product="${product.id}" data-color="${escapeHTML(color.name)}" aria-label="Color ${escapeHTML(color.name)}" title="${escapeHTML(color.name)}" aria-pressed="${selectedColor === color.name}" style="--swatch:${color.hex}"></button>`).join("")}</div>`;
}

function renderSizes(product, scope) {
  const selectedSize = state.selections[product.id]?.size || "";
  return `<div class="size-options" role="group" aria-label="Choose a size">${product.sizes.map((size) => `
    <button class="size-chip ${selectedSize === size ? "selected" : ""}" type="button" data-action="size" data-scope="${scope}" data-product="${product.id}" data-size="${escapeHTML(size)}" aria-pressed="${selectedSize === size}">${escapeHTML(size === "One Size" ? "ONE" : size)}</button>`).join("")}</div>`;
}

function starsHTML(value) {
  const full = Math.round(Number(value) || 0);
  return `<span class="stars" aria-hidden="true">${"★".repeat(full)}${"☆".repeat(5 - full)}</span>`;
}

function reviewDate(value) {
  try { return new Intl.DateTimeFormat("en-PH", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(value)); }
  catch { return ""; }
}

async function loadQuickReviews(productId) {
  const holder = document.querySelector(`[data-reviews-for="${productId}"]`);
  if (!holder) return;
  try {
    const data = await window.JacohAPI.request(`/api/products/${encodeURIComponent(productId)}/reviews`);
    if (!holder.isConnected) return;
    if (!data.summary.count) { holder.innerHTML = `<h3 class="reviews-title">CUSTOMER REVIEWS</h3><p class="reviews-empty">No reviews yet. Customers can review this piece after their order is delivered.</p>`; return; }
    holder.innerHTML = `<h3 class="reviews-title">CUSTOMER REVIEWS</h3><div class="reviews-summary">${starsHTML(data.summary.average)} <b>${data.summary.average.toFixed(1)}</b> <span>/ 5 · ${data.summary.count} review${data.summary.count === 1 ? "" : "s"}</span></div>` +
      data.reviews.map((item) => `<article class="review-item"><div class="review-head">${starsHTML(item.rating)}<b>${escapeHTML(item.reviewer)}</b><small>${reviewDate(item.createdAt)} · VERIFIED PURCHASE</small></div>${item.comment ? `<p>${escapeHTML(item.comment)}</p>` : ""}</article>`).join("");
  } catch { if (holder.isConnected) holder.innerHTML = ""; }
}

function renderProductCard(product) {
  const selectedColor = state.selections[product.id]?.color || product.color;
  const stock = product.stock < 4 ? `<span class="stock-flag">${product.stock ? `ONLY ${product.stock} LEFT` : "SOLD OUT"}</span>` : "";
  return `<article class="product-card" data-product-id="${product.id}">
    <div class="product-image-wrap">
      <button class="product-image-button" type="button" data-action="details" data-product="${product.id}" aria-label="View ${escapeHTML(product.name)} details">
        <img src="${escapeHTML(product.image)}" alt="${escapeHTML(product.name)}" loading="lazy" />
        ${stock}<span class="quick-view-label">QUICK VIEW <b>↗</b></span>
      </button>
      <span class="product-index">J / 0${products.indexOf(product) + 1}</span>
    </div>
    <div class="product-info">
      <div class="product-title-line"><div><h3>${escapeHTML(product.name)}</h3><p class="product-color-meta">${escapeHTML(selectedColor)} <span>/</span> UNISEX</p></div><strong>${formatMoney(product.price)}</strong></div>
      <div class="rating-row"><span>${product.ratingCount ? `${starsHTML(product.ratingAverage)} ${Number(product.ratingAverage).toFixed(1)} (${product.ratingCount})` : "JACOH / COLLECTION"}</span><b>DROP 06</b></div>
    </div>
    <div class="product-options">
      <div class="option-row"><span class="option-label color-label">COLOR — ${escapeHTML(selectedColor.toUpperCase())}</span>${renderColorOptions(product, "card")}</div>
      <div class="option-row"><span class="option-label">SIZE</span>${renderSizes(product, "card")}</div>
      <button class="add-bag-btn" type="button" data-action="add" data-scope="card" data-product="${product.id}" ${!state.catalogReady || product.stock < 1 ? "disabled" : ""}><span>+</span> ${!state.catalogReady ? "LOADING" : product.stock < 1 ? "SOLD OUT" : "ADD TO BAG"} <i>↗</i></button>
    </div>
  </article>`;
}

function renderProducts() {
  const grid = document.getElementById("product-grid");
  if (!state.catalogReady) {
    grid.innerHTML = `<p class="catalog-status">${state.catalogError ? "The live catalog is unavailable. Refresh to try again." : "Loading the live Drop 06 catalog…"}</p>`;
    grid.hidden = false;
    document.getElementById("empty-results").hidden = true;
    document.querySelector(".collection-count").innerHTML = `<b id="result-count">—</b> live pieces in this collection <span>↘</span>`;
    const loadingCount = document.querySelector('.filter-button[data-filter="All"] span');
    if (loadingCount) loadingCount.textContent = "—";
    document.querySelectorAll(".filter-button").forEach((button) => {
      const active = button.dataset.filter === state.filter;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", String(active));
    });
    return;
  }
  const needle = state.query.trim().toLowerCase();
  const filtered = products.filter((product) => {
    const categoryMatch = state.filter === "All" || product.category === state.filter;
    const searchMatch = !needle || `${product.name} ${product.category} ${product.color}`.toLowerCase().includes(needle);
    return categoryMatch && searchMatch;
  });
  grid.innerHTML = filtered.map(renderProductCard).join("");
  document.getElementById("result-count").textContent = String(filtered.length);
  const allCount = document.querySelector('.filter-button[data-filter="All"] span');
  if (allCount) allCount.textContent = String(products.length);
  document.querySelector(".collection-count").innerHTML = `<b id="result-count">${filtered.length}</b> ${filtered.length === 1 ? "piece" : "pieces"} in this collection <span>↘</span>`;
  document.getElementById("empty-results").hidden = filtered.length > 0;
  grid.hidden = filtered.length === 0;
  document.querySelectorAll(".filter-button").forEach((button) => {
    const active = button.dataset.filter === state.filter;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  });
}

function setFilter(filter) {
  state.filter = filter === "New" ? "All" : filter;
  renderProducts();
  document.getElementById("mobile-menu").hidden = true;
  document.getElementById("menu-button").setAttribute("aria-expanded", "false");
}

async function loadCatalog() {
  try {
    const result = await window.JacohAPI.request("/api/products");
    if (!Array.isArray(result.products)) return;
    products = result.products.map((product) => ({ ...product, sellerId: Number(product.sellerId), price: Number(product.price), stock: Number(product.stock) }));
    state.catalogReady = true;
    state.catalogError = false;
    state.selections = Object.fromEntries(products.map((product) => {
      const old = state.selections[product.id] || {};
      return [product.id, { color: product.colors.some((item) => item.name === old.color) ? old.color : product.color, size: product.sizes.includes(old.size) ? old.size : (product.sizes.length === 1 ? product.sizes[0] : "") }];
    }));
    state.cart = state.cart.filter((item) => products.some((product) => product.id === item.id));
    persistCart();
    renderProducts();
    renderCart();
  } catch {
    state.catalogReady = false;
    state.catalogError = true;
    renderProducts();
    showToast("The live catalog could not be loaded. Refresh to try again.");
  }
}

function selectOption(button) {
  const { product: id, action, scope } = button.dataset;
  if (action === "color") state.selections[id].color = button.dataset.color;
  if (action === "size") state.selections[id].size = button.dataset.size;
  const container = scope === "quick" ? document.getElementById("quick-view-content") : document.getElementById("product-grid");
  const card = container.querySelector(`[data-product-id="${id}"]`) || container;
  if (action === "color") {
    card.querySelectorAll(`[data-action="color"][data-product="${id}"]`).forEach((swatch) => {
      const selected = swatch.dataset.color === state.selections[id].color;
      swatch.classList.toggle("selected", selected);
      swatch.setAttribute("aria-pressed", String(selected));
    });
    const label = card.querySelector(".color-label");
    if (label) label.textContent = `COLOR — ${state.selections[id].color.toUpperCase()}`;
    const meta = card.querySelector(".product-color-meta");
    if (meta) meta.innerHTML = `${escapeHTML(state.selections[id].color)} <span>/</span> UNISEX`;
  } else {
    card.querySelectorAll(`[data-action="size"][data-product="${id}"]`).forEach((chip) => {
      const selected = chip.dataset.size === state.selections[id].size;
      chip.classList.toggle("selected", selected);
      chip.setAttribute("aria-pressed", String(selected));
    });
  }
}

function showToast(message) {
  const toast = document.getElementById("toast");
  toast.textContent = message;
  toast.classList.add("visible");
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => toast.classList.remove("visible"), 2600);
}

function addToCart(id, scope = "card") {
  const product = productById(id);
  if (!state.catalogReady) {
    showToast("The live catalog is still loading. Please try again shortly");
    return false;
  }
  if (!product || product.stock < 1) {
    showToast("This piece is currently sold out");
    return false;
  }
  const cartSellerIds = new Set(state.cart.map((item) => Number(productById(item.id)?.sellerId)).filter(Number.isFinite));
  if (cartSellerIds.size > 1 || (cartSellerIds.size === 1 && !cartSellerIds.has(Number(product.sellerId)))) {
    showToast("Place separate orders for products from different Sellers");
    return false;
  }
  const selection = state.selections[id];
  if (!selection.size) {
    showToast("Choose a size first");
    const card = document.querySelector(`[data-product-id="${id}"]`);
    card?.querySelector(".size-options")?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    return false;
  }
  if (scope === "quick") closeQuickView();
  const existing = state.cart.find((item) => item.id === id && item.size === selection.size && item.color === selection.color);
  const productTotal = state.cart.filter((item) => item.id === id).reduce((sum, item) => sum + item.quantity, 0);
  if (productTotal >= product.stock) {
    showToast("Your bag has reached the available stock for this piece");
    return false;
  }
  if (existing) existing.quantity += 1;
  else state.cart.push({ id, size: selection.size, color: selection.color, quantity: 1 });
  persistCart();
  renderCart();
  showToast(`${product.name} added to your bag`);
  if (window.matchMedia("(max-width: 700px)").matches) openCart();
  return true;
}

function cartCount() {
  return state.cart.reduce((sum, item) => sum + item.quantity, 0);
}

function subtotal() {
  return state.cart.reduce((sum, item) => sum + (productById(item.id)?.price || 0) * item.quantity, 0);
}

function cartLineHTML(item, index) {
  const product = productById(item.id);
  if (!product) return "";
  return `<article class="cart-line">
    <img src="${escapeHTML(product.image)}" alt="" />
    <div class="cart-line-copy"><div class="cart-line-top"><div><h3>${escapeHTML(product.name)}</h3><p>${escapeHTML(item.color)} / ${escapeHTML(item.size)}</p></div><strong>${formatMoney(product.price * item.quantity)}</strong></div>
      <div class="cart-line-bottom"><div class="quantity-control" aria-label="Quantity for ${escapeHTML(product.name)}"><button type="button" data-action="quantity" data-index="${index}" data-delta="-1" aria-label="Decrease quantity">−</button><span>${item.quantity}</span><button type="button" data-action="quantity" data-index="${index}" data-delta="1" aria-label="Increase quantity" ${item.quantity >= product.stock ? "disabled" : ""}>+</button></div><button class="remove-item" type="button" data-action="remove" data-index="${index}">REMOVE</button></div>
    </div>
  </article>`;
}

function renderCart() {
  const count = cartCount();
  const sum = subtotal();
  document.getElementById("bag-count").textContent = String(count);
  document.getElementById("bag-button").setAttribute("aria-label", `Open shopping bag, ${count} ${count === 1 ? "item" : "items"}`);
  document.getElementById("drawer-item-count").textContent = `(${String(count).padStart(2, "0")})`;
  document.getElementById("cart-subtotal").textContent = formatMoney(sum);
  document.getElementById("cart-items").innerHTML = state.cart.map(cartLineHTML).join("");
  document.getElementById("cart-items").hidden = count === 0;
  document.getElementById("empty-bag").hidden = count > 0;
  document.getElementById("cart-summary").hidden = count === 0;
  const checkoutButton = document.getElementById("checkout-button");
  if (checkoutButton) checkoutButton.innerHTML = !state.sessionChecked || isCustomer() ? "GO TO CHECKOUT <span>↗</span>" : state.user ? "CUSTOMER ACCOUNT REQUIRED <span>↗</span>" : "SIGN IN TO CHECK OUT <span>↗</span>";
  document.getElementById("cart-delivery").textContent = sum >= FREE_DELIVERY ? "FREE" : "Calculated at checkout";
  const remaining = Math.max(0, FREE_DELIVERY - sum);
  const progress = Math.min(100, (sum / FREE_DELIVERY) * 100);
  document.getElementById("shipping-progress").innerHTML = sum >= FREE_DELIVERY
    ? `<p><strong>YOU'RE ON THE LIST.</strong> Free Talisay City delivery unlocked.</p><div class="progress-track"><i style="width:100%"></i></div>`
    : `<p>ADD <strong>${formatMoney(remaining)}</strong> FOR FREE TALISAY CITY DELIVERY</p><div class="progress-track"><i style="width:${progress}%"></i></div>`;
}

function openCart() {
  document.getElementById("drawer-scrim").hidden = false;
  document.getElementById("cart-drawer").hidden = false;
  document.body.classList.add("overlay-open");
  document.querySelector(".close-drawer").focus();
}

function closeCart() {
  document.getElementById("drawer-scrim").hidden = true;
  document.getElementById("cart-drawer").hidden = true;
  document.body.classList.remove("overlay-open");
}

function openQuickView(id) {
  const product = productById(id);
  document.getElementById("quick-view-content").innerHTML = `<div class="quick-product" data-product-id="${product.id}">
    <div class="quick-image"><img src="${escapeHTML(product.image)}" alt="${escapeHTML(product.name)}" /></div>
    <div class="quick-copy"><div class="eyebrow">DROP 06 / ${String(products.indexOf(product) + 1).padStart(2, "0")}</div><div class="rating-row"><span>JACOH / COLLECTION</span><b>DROP 06</b></div>
      <h2>${escapeHTML(product.name)}</h2><p class="quick-color-meta product-color-meta">${escapeHTML(state.selections[id].color)} <span>/</span> UNISEX</p><strong class="quick-price">${formatMoney(product.price)}</strong><p class="quick-description">${escapeHTML(product.description)}</p>
      <div class="quick-option-block"><div class="quick-option-head"><span>COLOR</span><b class="color-label">— ${escapeHTML(state.selections[id].color.toUpperCase())}</b></div>${renderColorOptions(product, "quick")}</div>
      <div class="quick-option-block"><div class="quick-option-head"><span>SIZE</span><a href="#size-guide" class="size-guide-link">SIZE GUIDE ↗</a></div>${renderSizes(product, "quick")}</div>
      <button class="solid-button quick-add" type="button" data-action="add" data-scope="quick" data-product="${product.id}" ${!state.catalogReady || product.stock < 1 ? "disabled" : ""}>${!state.catalogReady ? "LOADING" : product.stock < 1 ? "SOLD OUT" : "ADD TO BAG"} <span>↗</span></button><p class="quick-note">LOCAL DELIVERY AVAILABLE / TALISAY CITY</p>
      <section class="quick-reviews" data-reviews-for="${escapeHTML(product.id)}"><p class="reviews-empty">Loading reviews…</p></section>
    </div>
  </div>`;
  loadQuickReviews(product.id);
  document.getElementById("quick-view-backdrop").hidden = false;
  document.getElementById("quick-view").hidden = false;
  document.body.classList.add("overlay-open");
  document.getElementById("quick-close").focus();
}

function closeQuickView() {
  document.getElementById("quick-view-backdrop").hidden = true;
  document.getElementById("quick-view").hidden = true;
  document.body.classList.remove("overlay-open");
}

// Who is signed in? Checkout is only available to customer accounts.
state.user = null;
state.profile = null;
state.sessionPromise = window.JacohAPI.request("/api/auth/me")
  .then(({ user }) => { state.user = user || null; })
  .catch(() => { state.user = null; })
  .then(() => { state.sessionChecked = true; renderCart(); });

function isCustomer() { return state.user?.accountType === "customer"; }

async function prefillCheckout() {
  const form = document.getElementById("checkout-form");
  if (!form || !isCustomer()) return;
  const setIfEmpty = (name, value) => { const field = form.elements[name]; if (field && !field.value && value) field.value = value; };
  form.elements.email.value = state.user.email; // the order always belongs to this account
  form.elements.email.readOnly = true;
  const parts = String(state.user.name || "").trim().split(/\s+/);
  setIfEmpty("firstName", parts.slice(0, -1).join(" ") || parts[0] || "");
  setIfEmpty("lastName", parts.length > 1 ? parts[parts.length - 1] : "");
  try {
    if (!state.profile) state.profile = (await window.JacohAPI.request("/api/customer/profile")).profile;
    setIfEmpty("phone", state.profile.phone); setIfEmpty("address", state.profile.address);
    setIfEmpty("postal", state.profile.postalCode);
    if (state.profile.city) form.elements.city.value = state.profile.city;
  } catch { /* Saved details are a convenience only. */ }
}

async function openCheckout() {
  if (!state.cart.length) return;
  await state.sessionPromise;
  if (!state.user) {
    showToast("Please sign in to continue to checkout. Your bag will be waiting.");
    setTimeout(() => window.location.assign("/sign-in?next=%2F%3Fcheckout%3D1"), 900);
    return;
  }
  if (!isCustomer()) { showToast("Staff accounts cannot place orders. Sign in with a customer account to check out."); return; }
  closeCart();
  renderCheckout();
  prefillCheckout();
  document.getElementById("checkout-screen").hidden = false;
  document.body.classList.add("overlay-open", "checkout-open");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function closeCheckout() {
  document.getElementById("checkout-screen").hidden = true;
  document.body.classList.remove("overlay-open", "checkout-open");
}

function renderCheckout() {
  document.getElementById("checkout-items").innerHTML = state.cart.filter((item) => productById(item.id)).map((item) => {
    const product = productById(item.id);
    return `<div class="checkout-line"><div class="checkout-thumb"><img src="${product.image}" alt="" /><span>${item.quantity}</span></div><div><strong>${escapeHTML(product.name)}</strong><small>${escapeHTML(item.color)} / ${escapeHTML(item.size)}</small></div><b>${formatMoney(product.price * item.quantity)}</b></div>`;
  }).join("");
  const sum = subtotal();
  const delivery = sum >= FREE_DELIVERY ? 0 : DELIVERY_FEE;
  document.getElementById("checkout-count").textContent = String(cartCount()).padStart(2, "0");
  document.getElementById("checkout-subtotal").textContent = formatMoney(sum);
  document.getElementById("checkout-delivery").textContent = delivery === 0 ? "FREE" : formatMoney(delivery);
  document.getElementById("checkout-total").textContent = formatMoney(sum + delivery);
}

function receiptDate(value) {
  const parsedDate = new Date(value);
  return Number.isNaN(parsedDate.getTime()) ? "—" : new Intl.DateTimeFormat("en-PH", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Manila" }).format(parsedDate);
}

function showOrderSuccess(receipt) {
  const success = document.getElementById("order-success");
  const address = [receipt.delivery.address, receipt.delivery.city, receipt.delivery.postalCode].filter(Boolean).join(", ");
  const orderStatus = ({ to_pack: "RECEIVED", processing: "PROCESSING", ready_to_ship: "READY TO SHIP", out_for_delivery: "OUT FOR DELIVERY", completed: "COMPLETED", cancelled: "CANCELLED" })[receipt.status] || "RECEIVED";
  const items = receipt.items.map((item) => `<tr><td data-label="PIECE"><strong>${escapeHTML(item.name)}</strong><small>${escapeHTML(item.sku)} · ${escapeHTML(item.color)} / ${escapeHTML(item.size)}</small></td><td data-label="QTY">${Number(item.quantity)}</td><td data-label="UNIT PRICE">${formatMoney(item.unitPrice)}</td><td data-label="AMOUNT"><strong>${formatMoney(item.lineTotal)}</strong></td></tr>`).join("");
  success.classList.add("order-success--receipt");
  success.innerHTML = `<article class="order-receipt-card"><header class="receipt-header"><a class="wordmark" href="#collection" aria-label="JACOH Apparel"><span class="wordmark-icon" aria-hidden="true">J<span>A</span></span><span class="wordmark-copy"><strong>JACOH</strong><small>APPAREL</small></span></a><div class="receipt-number"><span>ORDER RECEIPT</span><strong>${escapeHTML(receipt.orderId)}</strong></div></header><div class="receipt-confirmation"><span class="success-icon" aria-hidden="true">✓</span><div><div class="eyebrow">ORDER CONFIRMED</div><h2 id="success-title">YOU'RE<br /><em>LOCKED IN.</em></h2><p>Your order is saved and queued for fulfillment.</p></div><span class="receipt-status">${escapeHTML(orderStatus)}</span></div><div class="receipt-facts"><section><span>ORDER DATE</span><strong>${escapeHTML(receiptDate(receipt.createdAt))}</strong></section><section><span>PAYMENT</span><strong>CASH ON DELIVERY</strong><small>Due to the courier upon delivery</small></section>${receipt.logisticsName ? `<section><span>LOGISTICS PARTNER</span><strong>${escapeHTML(receipt.logisticsName)}</strong><small>Third-party courier</small></section>` : ""}<section><span>SHIP TO</span><strong>${escapeHTML(receipt.customer.name)}</strong><small>${escapeHTML(address)}<br />${escapeHTML(receipt.customer.phone)} · ${escapeHTML(receipt.customer.email)}</small>${receipt.delivery.notes ? `<small>Note: ${escapeHTML(receipt.delivery.notes)}</small>` : ""}</section></div><div class="receipt-items"><table><thead><tr><th>PIECE</th><th>QTY</th><th>UNIT PRICE</th><th>AMOUNT</th></tr></thead><tbody>${items}</tbody></table></div><div class="receipt-totals"><div><span>SUBTOTAL</span><strong>${formatMoney(receipt.subtotal)}</strong></div><div><span>DELIVERY</span><strong>${Number(receipt.deliveryFee) === 0 ? "FREE" : formatMoney(receipt.deliveryFee)}</strong></div><div class="receipt-total-due"><span>TOTAL DUE ON DELIVERY</span><strong>${formatMoney(receipt.total)}</strong></div></div><p class="receipt-legal">ORDER RECEIPT / CONFIRMATION ONLY — THIS IS NOT PROOF OF PAYMENT. Payment is due to the courier when your order is delivered.</p><footer class="receipt-actions"><button class="receipt-print" id="receipt-print" type="button">PRINT / SAVE AS PDF <span>↗</span></button><a class="solid-button" href="#collection" id="success-shop">BACK TO THE DROP <span>↗</span></a></footer></article>`;
  document.getElementById("checkout-screen").hidden = true;
  document.body.classList.remove("checkout-open");
  success.hidden = false;
  document.body.classList.add("overlay-open");
}

function closeOrderSuccess() {
  const success = document.getElementById("order-success");
  success.hidden = true;
  success.classList.remove("order-success--receipt");
  document.body.classList.remove("overlay-open");
  window.location.hash = "collection";
}

function inquiryDate(value) {
  try { return new Intl.DateTimeFormat("en-PH", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(value)); }
  catch { return ""; }
}

async function loadCustomerInquiryPage(banner = "") {
  const page = document.getElementById("customer-inquiries-page");
  if (!page) return;
  document.body.classList.add("customer-inquiries-active");
  page.hidden = false;
  document.title = "My inquiries — JACOH Apparel";
  page.innerHTML = `<div class="customer-account-shell"><header class="customer-account-header"><a class="wordmark" href="/" aria-label="JACOH Apparel home"><span class="wordmark-icon" aria-hidden="true">J<span>A</span></span><span class="wordmark-copy"><strong>JACOH</strong><small>APPAREL</small></span></a><span class="customer-header-links"><a class="customer-back-link" href="/account">MY ACCOUNT</a><a class="customer-back-link" href="/">BACK TO THE DROP ↗</a></span></header><div class="customer-account-content"><p class="eyebrow">CUSTOMER CARE / PRIVATE INBOX</p><h1>MY INQUIRIES</h1><p class="customer-account-intro">Keep the conversation here. Email notifications are not configured.</p><div class="customer-inquiry-notice" role="status">${escapeHTML(banner || "Loading your inquiries…")}</div></div></div>`;
  try {
    const session = await window.JacohAPI.request("/api/auth/me");
    if (session.user.accountType !== "customer") { window.location.replace(session.user.accountType === "owner" ? "/owner" : "/seller"); return; }
    const [inquiryData, catalogData] = await Promise.all([
      window.JacohAPI.request("/api/customer/inquiries"),
      window.JacohAPI.request("/api/products")
    ]);
    const inquiries = inquiryData.inquiries || [];
    const productOptions = (catalogData.products || []).map((product) => `<option value="${escapeHTML(product.id)}">${escapeHTML(product.name)}</option>`).join("");
    const inquiryCards = inquiries.length ? inquiries.map((item) => `<article class="customer-inquiry-card"><div class="customer-inquiry-card-top"><div><span class="eyebrow">${escapeHTML(item.subject)}</span><small>SUBMITTED ${inquiryDate(item.createdAt)}</small></div><span class="customer-inquiry-status">${escapeHTML(item.status.toUpperCase())}</span></div><div class="customer-inquiry-contact"><span>YOUR JACOH CONTACT</span><strong>${escapeHTML(item.assignedStaffName || "JACOH Support")}</strong></div><div class="customer-inquiry-message"><span>YOUR MESSAGE</span><p>${escapeHTML(item.message)}</p></div>${item.response ? `<div class="customer-inquiry-reply"><span>REPLY FROM ${escapeHTML(item.responderName || item.assignedStaffName || "JACOH Support")}</span><p>${escapeHTML(item.response)}</p></div>` : `<p class="customer-inquiry-waiting">Your contact will reply here when they update this inquiry.</p>`}</article>`).join("") : `<div class="customer-inquiry-empty"><span class="eyebrow">NO CONVERSATIONS YET</span><p>Send a question using the form and the JACOH team will reply here.</p></div>`;
    page.innerHTML = `<div class="customer-account-shell"><header class="customer-account-header"><a class="wordmark" href="/" aria-label="JACOH Apparel home"><span class="wordmark-icon" aria-hidden="true">J<span>A</span></span><span class="wordmark-copy"><strong>JACOH</strong><small>APPAREL</small></span></a><div class="customer-account-actions"><a class="customer-back-link" href="/account">MY ACCOUNT</a><span>${escapeHTML(session.user.name)}</span><button type="button" data-customer-signout>SIGN OUT</button></div></header><div class="customer-account-content"><p class="eyebrow">CUSTOMER CARE / PRIVATE INBOX</p><h1>MY INQUIRIES</h1><p class="customer-account-intro">Keep the conversation here. Email notifications are not configured.</p><div class="customer-inquiry-notice" role="status">${escapeHTML(banner)}</div><div class="customer-inquiry-layout"><section class="customer-inquiry-list"><div class="customer-inquiry-section-head"><span class="eyebrow">YOUR CONVERSATIONS</span><strong>${inquiries.length}</strong></div>${inquiryCards}</section><section class="customer-inquiry-compose"><span class="eyebrow">NEED A HAND?</span><h2>MESSAGE THE TEAM</h2><p>Choose a product or send a general question. We’ll show you which staff member is handling it.</p><form id="customer-inquiry-form"><input type="hidden" name="name" value="${escapeHTML(session.user.name)}" /><input type="hidden" name="email" value="${escapeHTML(session.user.email)}" /><label>RELATED PRODUCT <select name="productId"><option value="">GENERAL QUESTION</option>${productOptions}</select></label><label>SUBJECT <input name="subject" maxlength="180" required /></label><label>MESSAGE <textarea name="message" maxlength="4000" rows="5" required></textarea></label><button class="customer-inquiry-submit" type="submit">SEND INQUIRY <span>↗</span></button></form></section></div><footer class="customer-account-footer"><a href="/">JACOH APPAREL / BACK TO SHOP ↑</a></footer></div></div>`;
  } catch (error) {
    if (error.status === 401) { window.location.replace("/sign-in?next=%2Fcustomer-inquiries"); return; }
    page.innerHTML = `<div class="customer-account-shell"><header class="customer-account-header"><a class="wordmark" href="/">JACOH APPAREL</a><a href="/">BACK TO SHOP ↗</a></header><div class="customer-account-content"><h1>INBOX UNAVAILABLE</h1><p>${escapeHTML(error.message)}</p><button class="customer-inquiry-submit" type="button" data-retry-customer-inquiries>TRY AGAIN ↗</button></div></div>`;
  }
}

document.addEventListener("click", (event) => {
  const target = event.target.closest("button, a");
  if (!target) return;
  if (target.classList.contains("filter-button")) setFilter(target.dataset.filter);
  if (target.dataset.navFilter) {
    setFilter(target.dataset.navFilter);
    if (target.dataset.navFilter !== "New") document.getElementById("collection").scrollIntoView({ behavior: "smooth" });
  }
  if (target.id === "bag-button") openCart();
  if (target.id === "search-button") {
    document.getElementById("search-panel").hidden = false;
    document.getElementById("search-input").focus();
  }
  if (target.id === "close-search") {
    document.getElementById("search-panel").hidden = true;
    state.query = "";
    renderProducts();
  }
  if (target.id === "menu-button") {
    const menu = document.getElementById("mobile-menu");
    menu.hidden = !menu.hidden;
    target.setAttribute("aria-expanded", String(!menu.hidden));
  }
  if (target.id === "account-button") {
    event.preventDefault();
    window.JacohAPI.request("/api/auth/me").then(({ user }) => {
      window.location.assign(user.accountType === "customer" ? "/account" : user.accountType === "owner" ? "/owner" : "/seller");
    }).catch(() => window.location.assign("/sign-in?next=%2Faccount"));
  }
  if (target.hasAttribute("data-customer-signout")) {
    target.disabled = true;
    window.JacohAPI.request("/api/auth/logout", { method: "POST", body: "{}" }).then(() => window.location.assign("/")).catch((error) => {
      const notice = document.querySelector(".customer-inquiry-notice");
      if (notice) notice.textContent = error.message;
      target.disabled = false;
    });
  }
  if (target.hasAttribute("data-retry-customer-inquiries")) loadCustomerInquiryPage();
  if (target.dataset.closeCart !== undefined || target.id === "drawer-scrim") closeCart();
  if (target.id === "checkout-button") openCheckout();
  if (target.id === "close-checkout") closeCheckout();
  if (target.id === "quick-close" || target.id === "quick-view-backdrop") closeQuickView();
  if (target.id === "receipt-print") { window.print(); return; }
  if (target.id === "clear-filters") {
    state.filter = "All";
    state.query = "";
    document.getElementById("search-input").value = "";
    renderProducts();
  }
  if (target.dataset.action === "details") openQuickView(target.dataset.product);
  if (target.dataset.action === "color" || target.dataset.action === "size") selectOption(target);
  if (target.dataset.action === "add") addToCart(target.dataset.product, target.dataset.scope);
  if (target.dataset.action === "quantity") {
    const item = state.cart[Number(target.dataset.index)];
    if (item) {
      const product = productById(item.id);
      const delta = Number(target.dataset.delta);
      const productTotal = state.cart.filter((cartItem) => cartItem.id === item.id).reduce((sum, cartItem) => sum + cartItem.quantity, 0);
      if (delta > 0 && product && productTotal >= product.stock) { showToast("That is all the available stock for this piece"); return; }
      item.quantity += delta;
      if (item.quantity < 1) state.cart.splice(Number(target.dataset.index), 1);
      persistCart();
      renderCart();
      if (!state.cart.length) closeCart();
    }
  }
  if (target.dataset.action === "remove") {
    state.cart.splice(Number(target.dataset.index), 1);
    persistCart();
    renderCart();
    showToast("Piece removed from your bag");
  }
  if (target.id === "success-shop") closeOrderSuccess();
});

document.getElementById("drawer-scrim").addEventListener("click", closeCart);
document.getElementById("quick-view-backdrop").addEventListener("click", closeQuickView);

document.getElementById("search-input").addEventListener("input", (event) => {
  state.query = event.target.value;
  state.filter = "All";
  renderProducts();
});

document.getElementById("checkout-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!event.currentTarget.reportValidity()) return;
  const form = event.currentTarget;
  const button = form.querySelector("[type=submit]");
  const message = document.getElementById("checkout-message");
  message.hidden = true;
  button.disabled = true;
  try {
    const values = new FormData(form);
    const result = await window.JacohAPI.request("/api/orders", { method: "POST", body: JSON.stringify({
      name: `${values.get("firstName")} ${values.get("lastName")}`.trim(), email: values.get("email"), phone: values.get("phone"),
      address: values.get("address"), city: values.get("city"), postalCode: values.get("postal"), notes: values.get("notes"),
      paymentMethod: "cash_on_delivery", logisticsProvider: values.get("logistics") || "", idempotencyKey: state.pendingOrderReference,
      items: state.cart.map((item) => ({ id: item.id, size: item.size, color: item.color, quantity: item.quantity }))
    }) });
    if (!result.receipt?.items?.length) throw new Error("Your order was saved, but its receipt could not be loaded. Retry to retrieve the saved order without placing it again.");
    try { sessionStorage.removeItem("jacoh-checkout-reference"); } catch { /* Continue clearing the local cart after a confirmed order. */ }
    state.pendingOrderReference = newCheckoutReference();
    state.cart = [];
    persistCart();
    renderCart();
    showOrderSuccess(result.receipt);
    form.reset();
  } catch (error) {
    if (error.status && error.status < 500) {
      state.pendingOrderReference = newCheckoutReference();
      try { sessionStorage.setItem("jacoh-checkout-reference", state.pendingOrderReference); } catch { /* Use the in-memory reference. */ }
    }
    message.textContent = error.message;
    message.hidden = false;
  } finally { button.disabled = false; }
});

document.getElementById("newsletter-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!event.currentTarget.reportValidity()) return;
  const form = event.currentTarget;
  try {
    const result = await window.JacohAPI.request("/api/newsletter", { method: "POST", body: JSON.stringify({ email: form.querySelector('input[type="email"]').value }) });
    form.reset();
    showToast(result.message);
  } catch (error) { showToast(error.message); }
});

document.addEventListener("submit", async (event) => {
  const form = event.target.closest("#customer-inquiry-form");
  if (!form) return;
  event.preventDefault();
  if (!form.reportValidity()) return;
  const button = form.querySelector('[type="submit"]');
  button.disabled = true;
  try {
    const values = new FormData(form);
    const result = await window.JacohAPI.request("/api/inquiries", { method: "POST", body: JSON.stringify({ name: values.get("name"), email: values.get("email"), subject: values.get("subject"), message: values.get("message"), productId: values.get("productId") || undefined }) });
    await loadCustomerInquiryPage(`Sent to ${result.assignedStaffName || "JACOH Support"}. Replies will appear in your inbox.`);
  } catch (error) {
    const notice = document.querySelector(".customer-inquiry-notice");
    if (notice) notice.textContent = error.message;
    button.disabled = false;
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    closeCart();
    closeQuickView();
    closeCheckout();
    if (!document.getElementById("order-success").hidden) closeOrderSuccess();
  }
});

if (window.location.pathname.replace(/\/+$/, "") === "/customer-inquiries") loadCustomerInquiryPage();
else {
  renderProducts();
  renderCart();
  const resumeCheckout = new URLSearchParams(window.location.search).get("checkout") === "1";
  Promise.all([loadCatalog(), state.sessionPromise]).then(() => {
    if (!resumeCheckout) return;
    window.history.replaceState(null, "", "/");
    if (state.cart.length && state.catalogReady) openCheckout();
  });
}
