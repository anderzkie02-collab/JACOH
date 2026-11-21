(() => {
  let csrfPromise;
  async function getCsrf(force = false) {
    if (force) csrfPromise = null;
    if (!csrfPromise) {
      csrfPromise = fetch("/api/auth/csrf", { credentials: "same-origin", cache: "no-store" })
        .then(async (response) => {
          const data = await response.json();
          if (!response.ok || !data.csrfToken) throw new Error("Could not start a secure session. Refresh the page and try again.");
          return data.csrfToken;
        })
        .catch((error) => { csrfPromise = null; throw error; });
    }
    return csrfPromise;
  }

  async function request(url, options = {}, retry = true) {
    const method = (options.method || "GET").toUpperCase();
    const headers = new Headers(options.headers || {});
    if (options.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
    if (!new Set(["GET", "HEAD", "OPTIONS"]).has(method)) headers.set("X-CSRF-Token", await getCsrf());
    const response = await fetch(url, { ...options, method, headers, credentials: "same-origin", cache: "no-store" });
    let data = {};
    try { data = await response.json(); } catch { /* A non-JSON server error is handled below. */ }
    if (!response.ok && data.error?.code === "csrf_failed" && retry) {
      await getCsrf(true);
      return request(url, options, false);
    }
    if (!response.ok) {
      const error = new Error(data.error?.message || "The request could not be completed.");
      error.status = response.status;
      error.code = data.error?.code;
      throw error;
    }
    return data;
  }

  window.JacohAPI = { request, csrf: () => getCsrf() };
})();
