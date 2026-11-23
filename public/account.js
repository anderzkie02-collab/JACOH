// Customer "My Account" page: order status tracking, product reviews and personal settings.
(() => {
  if (window.location.pathname.replace(/\/+$/, "") !== "/account") return;
  const api = window.JacohAPI;
  const page = document.getElementById("customer-account-page");
  if (!api || !page) return;

  const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const money = (n) => `₱${Number(n || 0).toLocaleString("en-PH")}`;
  const when = (v) => { try { return new Intl.DateTimeFormat("en-PH", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(v)); } catch { return ""; } };
  const steps = [["to_pack", "ORDER PLACED"], ["processing", "PACKING"], ["ready_to_ship", "READY TO SHIP"], ["out_for_delivery", "OUT FOR DELIVERY"], ["completed", "DELIVERED"]];
  const stars = (n) => `<span class="stars" aria-label="${n} out of 5">${"★".repeat(n)}${"☆".repeat(5 - n)}</span>`;

  const ui = { tab: new URLSearchParams(location.search).get("tab") === "settings" ? "settings" : "orders", user: null, orders: [], profile: null, openReview: null, notice: "", noticeKind: "", logistics: [] };

  document.body.classList.add("customer-account-active");
  page.hidden = false;
  document.title = "My account — JACOH Apparel";

  function shell(body) {
    return `<div class="customer-account-shell"><header class="customer-account-header"><a class="wordmark" href="/" aria-label="JACOH Apparel home"><span class="wordmark-icon" aria-hidden="true">J<span>A</span></span><span class="wordmark-copy"><strong>JACOH</strong><small>APPAREL</small></span></a>
      <div class="customer-account-actions"><a class="customer-back-link" href="/">SHOP ↗</a><a class="customer-back-link" href="/customer-inquiries">INQUIRIES</a><span>${esc(ui.user?.name || "")}</span><button type="button" data-signout>SIGN OUT</button></div></header>${body}</div>`;
  }

  function orderCard(order) {
    const cancelled = order.status === "cancelled";
    const current = steps.findIndex(([key]) => key === order.status);
    const tracker = cancelled
      ? `<div class="acct-cancelled">ORDER CANCELLED</div>`
      : `<ol class="acct-track">${steps.map(([key, label], index) => `<li class="${index <= current ? "done" : ""}${index === current ? " now" : ""}"><i></i><span>${label}</span></li>`).join("")}</ol>`;
    const delivered = order.status === "completed";
    const items = order.items.map((item) => {
      const reviewKey = `${order.id}:${item.productId}`;
      let review = "";
      if (delivered) {
        review = item.reviewRating
          ? `<div class="acct-review-line">${stars(item.reviewRating)} <span>YOUR REVIEW</span><button type="button" data-open-review="${esc(reviewKey)}">EDIT</button></div>`
          : `<div class="acct-review-line"><button type="button" class="acct-rate" data-open-review="${esc(reviewKey)}">★ RATE THIS PRODUCT</button></div>`;
        if (ui.openReview === reviewKey) {
          const start = item.reviewRating || 0;
          review += `<form class="acct-review-form" data-review-form="${esc(item.productId)}"><div class="acct-star-input" role="radiogroup" aria-label="Rating">${[1, 2, 3, 4, 5].map((n) => `<button type="button" role="radio" aria-checked="${n === start}" data-star="${n}" class="${n <= start ? "on" : ""}" aria-label="${n} star${n > 1 ? "s" : ""}">★</button>`).join("")}</div><input type="hidden" name="rating" value="${start || ""}" />
            <textarea name="comment" maxlength="1000" rows="3" placeholder="How was the fit and quality? (optional)">${esc(item.reviewComment || "")}</textarea>
            <div class="acct-form-actions"><button type="submit" class="acct-primary">SAVE REVIEW</button><button type="button" data-close-review>CANCEL</button></div></form>`;
        }
      }
      return `<div class="acct-item"><img src="${esc(item.image || "/assets/jacoh-mark.svg")}" alt="" /><div><strong>${esc(item.itemName)}</strong><small>${esc(item.selectedColor)} / ${esc(item.selectedSize)} × ${item.quantity}</small>${review}</div><b>${money(item.unitPrice * item.quantity)}</b></div>`;
    }).join("");
    const courier = order.canChangeCourier
      ? `<label class="acct-courier"><span>LOGISTICS PARTNER</span><select data-courier-select="${esc(order.id)}" aria-label="Logistics partner for order ${esc(order.id)}">${order.logisticsProvider ? "" : `<option value="" selected disabled>Choose a courier</option>`}${(ui.logistics || []).map((o) => `<option value="${esc(o.id)}" ${o.id === order.logisticsProvider ? "selected" : ""}>${esc(o.name)}</option>`).join("")}</select><small>You can change this until your order is packed.</small></label>`
      : (order.logisticsName ? `<div class="acct-courier"><span>LOGISTICS PARTNER</span><strong>${esc(order.logisticsName)}</strong></div>` : "");
    const cancelBox = order.canCancel
      ? `<div class="acct-actions"><button type="button" class="acct-cancel-btn${order.cancelPenalty ? " penalty" : ""}" data-cancel-order="${esc(order.id)}" data-penalty="${order.cancelPenalty ? "1" : "0"}">CANCEL ORDER</button>${order.cancelPenalty ? `<small>Your parcel is out for delivery. Cancelling now suspends your account for ${order.penaltyMonths || 3} months.</small>` : ""}</div>`
      : "";
    return `<article class="acct-order"><header><div><span class="eyebrow">ORDER ${esc(order.id)}</span><small>PLACED ${when(order.createdAt)} · CASH ON DELIVERY</small></div><strong>${money(order.total)}</strong></header>${tracker}${courier}<div class="acct-items">${items}</div>${cancelBox}<footer><span>SUBTOTAL ${money(order.subtotal)}</span><span>DELIVERY ${money(order.deliveryFee)}</span><span>UPDATED ${when(order.updatedAt)}</span></footer></article>`;
  }

  function ordersView() {
    if (!ui.orders.length) return `<div class="acct-empty"><h2>NO ORDERS YET</h2><p>When you place an order, you can follow its status here.</p><a class="acct-primary" href="/#collection">SHOP THE DROP ↗</a></div>`;
    return ui.orders.map(orderCard).join("");
  }

  function settingsView() {
    const p = ui.profile || {};
    const field = (name, label, value, extra = "") => `<label class="acct-field"><span>${label}</span><input name="${name}" value="${esc(value)}" ${extra} /></label>`;
    return `<div class="acct-settings"><form class="acct-card" data-profile-form><h2>PERSONAL DETAILS</h2>
      <label class="acct-field"><span>EMAIL</span><input value="${esc(p.email)}" disabled /><small>Your email is your sign-in and can't be changed here.</small></label>
      ${field("fullName", "FULL NAME", p.fullName, 'required maxlength="120" autocomplete="name"')}${field("phone", "PHONE NUMBER", p.phone, 'maxlength="40" autocomplete="tel"')}
      ${field("address", "STREET ADDRESS", p.address, 'maxlength="255" autocomplete="street-address"')}${field("city", "CITY", p.city, 'maxlength="120" autocomplete="address-level2"')}${field("postalCode", "POSTAL CODE", p.postalCode, 'maxlength="24" autocomplete="postal-code"')}
      <button type="submit" class="acct-primary">SAVE CHANGES</button></form>
      <form class="acct-card" data-password-form><h2>CHANGE PASSWORD</h2><p class="acct-hint">After saving, you will be signed out and can sign in with the new password.</p>
      <label class="acct-field"><span>CURRENT PASSWORD</span><input type="password" name="currentPassword" required maxlength="72" autocomplete="current-password" /></label>
      <label class="acct-field"><span>NEW PASSWORD (AT LEAST 8 CHARACTERS)</span><input type="password" name="newPassword" required minlength="8" maxlength="72" autocomplete="new-password" /></label>
      <label class="acct-field"><span>CONFIRM NEW PASSWORD</span><input type="password" name="confirmPassword" required minlength="8" maxlength="72" autocomplete="new-password" /></label>
      <button type="submit" class="acct-primary">UPDATE PASSWORD</button></form></div>`;
  }

  function render() {
    page.innerHTML = shell(`<div class="customer-account-content"><p class="eyebrow">CUSTOMER / MY ACCOUNT</p><h1>MY ACCOUNT</h1>
      <nav class="acct-tabs" aria-label="Account sections"><button type="button" data-tab="orders" class="${ui.tab === "orders" ? "on" : ""}">MY ORDERS</button><button type="button" data-tab="settings" class="${ui.tab === "settings" ? "on" : ""}">SETTINGS</button></nav>
      <div class="acct-notice ${ui.noticeKind}" role="status" ${ui.notice ? "" : "hidden"}>${esc(ui.notice)}</div>
      ${ui.tab === "orders" ? ordersView() : settingsView()}</div>`);
  }

  function notify(message, kind = "") { ui.notice = message; ui.noticeKind = kind; render(); window.scrollTo({ top: 0, behavior: "smooth" }); }

  async function loadOrders() {
    const result = await api.request("/api/customer/orders");
    ui.orders = result.orders || []; ui.logistics = result.logisticsOptions || [];
  }
  async function loadProfile() { ui.profile = (await api.request("/api/customer/profile")).profile; }

  async function start() {
    page.innerHTML = shell(`<div class="customer-account-content"><p class="eyebrow">CUSTOMER / MY ACCOUNT</p><h1>MY ACCOUNT</h1><div class="acct-notice">Loading your account…</div></div>`);
    try {
      const session = await api.request("/api/auth/me");
      if (session.user.accountType !== "customer") { window.location.replace(session.user.accountType === "owner" ? "/owner" : "/seller"); return; }
      ui.user = session.user;
      await Promise.all([loadOrders(), loadProfile()]);
      render();
    } catch (error) {
      if (error.status === 401) { window.location.replace("/sign-in?next=%2Faccount"); return; }
      page.innerHTML = shell(`<div class="customer-account-content"><h1>ACCOUNT UNAVAILABLE</h1><p>${esc(error.message)}</p><button class="acct-primary" type="button" data-retry>TRY AGAIN ↗</button></div>`);
    }
  }

  page.addEventListener("click", async (event) => {
    const t = event.target.closest("button");
    if (!t) return;
    if (t.dataset.tab) { ui.tab = t.dataset.tab; ui.notice = ""; render(); return; }
    if (t.dataset.openReview) { ui.openReview = ui.openReview === t.dataset.openReview ? null : t.dataset.openReview; render(); return; }
    if (t.hasAttribute("data-close-review")) { ui.openReview = null; render(); return; }
    if (t.dataset.star) {
      const form = t.closest("form"); form.elements.rating.value = t.dataset.star;
      form.querySelectorAll("[data-star]").forEach((b) => { const on = Number(b.dataset.star) <= Number(t.dataset.star); b.classList.toggle("on", on); b.setAttribute("aria-checked", String(Number(b.dataset.star) === Number(t.dataset.star))); });
      return;
    }
    if (t.dataset.cancelOrder) {
      const penalty = t.dataset.penalty === "1";
      const question = penalty
        ? "Your parcel is already out for delivery. Cancelling now will suspend your account for 3 months. Cancel anyway?"
        : "Cancel this order?";
      if (!window.confirm(question)) return;
      t.disabled = true;
      try {
        const result = await api.request(`/api/customer/orders/${encodeURIComponent(t.dataset.cancelOrder)}/cancel`, { method: "POST", body: "{}" });
        if (result.suspended) {
          notify(`Order cancelled. Your account is suspended until ${when(result.suspensionUntil)}.`, "error");
          setTimeout(() => window.location.assign("/"), 5000);
          return;
        }
        await loadOrders(); notify("Your order has been cancelled.", "ok");
      } catch (error) { t.disabled = false; notify(error.message, "error"); }
      return;
    }
    if (t.hasAttribute("data-retry")) { start(); return; }
    if (t.hasAttribute("data-signout")) {
      t.disabled = true;
      try { await api.request("/api/auth/logout", { method: "POST", body: "{}" }); window.location.assign("/"); } catch (error) { t.disabled = false; notify(error.message, "error"); }
    }
  });

  page.addEventListener("change", async (event) => {
    const select = event.target.closest("[data-courier-select]");
    if (!select || !select.value) return;
    select.disabled = true;
    try {
      await api.request(`/api/customer/orders/${encodeURIComponent(select.dataset.courierSelect)}/logistics`, { method: "PATCH", body: JSON.stringify({ provider: select.value }) });
      await loadOrders(); notify("Logistics partner updated.", "ok");
    } catch (error) { select.disabled = false; notify(error.message, "error"); }
  });

  page.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.target; const submit = form.querySelector("[type=submit]"); submit.disabled = true;
    try {
      if (form.hasAttribute("data-review-form")) {
        const rating = Number(form.elements.rating.value);
        if (!rating) { submit.disabled = false; notify("Tap the stars to choose a rating first.", "error"); return; }
        await api.request(`/api/customer/reviews/${encodeURIComponent(form.dataset.reviewForm)}`, { method: "POST", body: JSON.stringify({ rating, comment: form.elements.comment.value }) });
        ui.openReview = null; await loadOrders(); notify("Thanks! Your review is now shown on the product page.", "ok"); return;
      }
      if (form.hasAttribute("data-profile-form")) {
        const v = Object.fromEntries(new FormData(form).entries());
        await api.request("/api/customer/profile", { method: "PATCH", body: JSON.stringify(v) });
        ui.user = { ...ui.user, name: v.fullName }; await loadProfile(); notify("Your details were saved.", "ok"); return;
      }
      if (form.hasAttribute("data-password-form")) {
        const v = Object.fromEntries(new FormData(form).entries());
        if (v.newPassword !== v.confirmPassword) { submit.disabled = false; notify("Those passwords do not match.", "error"); return; }
        await api.request("/api/auth/password", { method: "POST", body: JSON.stringify({ currentPassword: v.currentPassword, newPassword: v.newPassword }) });
        window.location.assign("/sign-in"); return;
      }
    } catch (error) { submit.disabled = false; notify(error.message, "error"); }
  });

  start();
})();
