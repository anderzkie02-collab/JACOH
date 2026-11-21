const http = require("node:http");
const path = require("node:path");
const { createPool, ensureSchema } = require("./db");
const { dispatchApi } = require("./src/api");
const { currentUser, json, fail } = require("./src/security");

// The pool is created lazily so the same file works as a long-running server (npm start) and as a Vercel function.
let poolInstance;
const getPool = () => (poolInstance ||= createPool());
const pool = {
  execute: (...args) => getPool().execute(...args),
  query: (...args) => getPool().query(...args),
  getConnection: () => getPool().getConnection(),
  end: () => (poolInstance ? poolInstance.end() : Promise.resolve())
};
const publicDir = path.join(__dirname, "public");
const port = Number(process.env.PORT) || 3000;
const mime = {
  ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8", ".svg": "image/svg+xml", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
  ".png": "image/png", ".webp": "image/webp", ".ico": "image/x-icon"
};

async function servePage(request, response, url) {
  let pathname;
  try { pathname = decodeURIComponent(url.pathname); }
  catch { response.writeHead(400).end("Bad request"); return; }
  const pagePath = pathname.replace(/\/+$/, "") || "/";
  if (request.method === "GET" && ["/seller", "/owner", "/sign-in", "/sign-up", "/customer-inquiries", "/account"].includes(pagePath)) {
    const user = await currentUser(request, pool);
    if ((pagePath === "/seller" || pagePath === "/owner") && !user) {
      response.writeHead(302, { Location: "/sign-in", "Cache-Control": "no-store" }).end(); return;
    }
    if (pagePath === "/account" && !user) {
      response.writeHead(302, { Location: "/sign-in?next=%2Faccount", "Cache-Control": "no-store" }).end(); return;
    }
    if (pagePath === "/customer-inquiries" && !user) {
      response.writeHead(302, { Location: "/sign-in?next=%2Fcustomer-inquiries", "Cache-Control": "no-store" }).end(); return;
    }
    if (user?.account_type === "owner" && pagePath !== "/owner") {
      response.writeHead(302, { Location: "/owner", "Cache-Control": "no-store" }).end(); return;
    }
    if (user?.account_type === "seller" && pagePath !== "/seller") {
      response.writeHead(302, { Location: "/seller", "Cache-Control": "no-store" }).end(); return;
    }
    if (user?.account_type === "customer" && ["/seller", "/owner"].includes(pagePath)) {
      response.writeHead(302, { Location: "/customer-inquiries", "Cache-Control": "no-store" }).end(); return;
    }
    if (user?.account_type === "customer" && ["/sign-in", "/sign-up"].includes(pagePath)) {
      response.writeHead(302, { Location: "/", "Cache-Control": "no-store" }).end(); return;
    }
  }
  const relative = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
  const file = path.resolve(publicDir, relative);
  if (file !== publicDir && !file.startsWith(`${publicDir}${path.sep}`)) { response.writeHead(403).end("Forbidden"); return; }
  const fs = require("node:fs");
  fs.stat(file, (statError, stat) => {
    const resolved = !statError && stat.isDirectory() ? path.join(file, "index.html") : file;
    fs.readFile(resolved, (error, data) => {
      if (error) {
        if (path.extname(pathname)) { response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }).end("Not found"); return; }
        fs.readFile(path.join(publicDir, "index.html"), (fallbackError, fallback) => {
          if (fallbackError) { response.writeHead(500).end("Application unavailable"); return; }
          response.writeHead(200, { "Content-Type": mime[".html"], "Cache-Control": "no-cache", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "strict-origin-when-cross-origin" }).end(fallback);
        });
        return;
      }
      response.writeHead(200, {
        "Content-Type": mime[path.extname(resolved).toLowerCase()] || "application/octet-stream",
        "Cache-Control": "no-cache",
        "X-Content-Type-Options": "nosniff",
        "Referrer-Policy": "strict-origin-when-cross-origin"
      });
      response.end(data);
    });
  });
}

async function handler(request, response) {
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  const url = new URL(request.url, "http://localhost");
  try {
    if (request.method === "GET" && url.pathname === "/healthz") {
      try { await pool.query("SELECT 1"); return json(response, 200, { ok: true }); }
      catch { return json(response, 503, { ok: false }); }
    }
    if (url.pathname.startsWith("/api/")) {
      const handled = await dispatchApi(request, response, url, pool);
      if (handled || response.writableEnded || response.headersSent) return; // never answer twice
      return fail(response, 404, "Endpoint not found.", "not_found");
    }
    if (request.method !== "GET" && request.method !== "HEAD") { response.writeHead(405, { Allow: "GET, HEAD" }).end(); return; }
    await servePage(request, response, url);
  } catch (error) {
    if (response.headersSent) { response.destroy(); return; }
    if (error.statusCode) return fail(response, error.statusCode, error.message, "invalid_request");
    console.error("Application request failed", url.pathname, error.code || error.name || "error", error.message || "");
    return fail(response, 500, "Something went wrong. Please try again.", "server_error");
  }
}

async function start() {
  await ensureSchema(pool);
  await pool.query("SELECT 1");
  const server = http.createServer(handler);
  server.listen(port, "0.0.0.0", () => console.log(`JACOH application listening on 0.0.0.0:${port}`));
  for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => { server.close(); pool.end().finally(() => process.exit(0)); });
}

if (require.main === module) {
  start().catch((error) => {
    console.error("Application startup failed", error.code || error.name || "database_error");
    process.exitCode = 1;
  });
}

module.exports = handler;
