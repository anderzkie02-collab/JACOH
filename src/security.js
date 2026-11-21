const crypto = require("node:crypto");

const SESSION_COOKIE = "jacoh_session";
const CSRF_COOKIE = "jacoh_csrf";

function json(response, status, data, headers = {}) {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", ...headers });
  response.end(JSON.stringify(data));
  return true; // callers return this value so dispatchApi knows the request was handled
}

function fail(response, status, message, code) {
  return json(response, status, { error: { message, ...(code ? { code } : {}) } });
}

function cookieMap(request) {
  const result = {};
  for (const part of (request.headers.cookie || "").split(";")) {
    const index = part.indexOf("=");
    if (index < 1) continue;
    try { result[part.slice(0, index).trim()] = decodeURIComponent(part.slice(index + 1).trim()); }
    catch { /* Ignore a malformed cookie and treat the session as absent. */ }
  }
  return result;
}

function cookieSuffix(request) {
  const publicOrigin = request.headers.origin || request.headers.referer || "";
  const forwardedProto = String(request.headers["x-forwarded-proto"] || "").split(",")[0].trim();
  return publicOrigin.startsWith("https://") || forwardedProto === "https" ? "; SameSite=None; Secure" : "; SameSite=Lax";
}

function addCookie(response, request, name, value, { maxAge = 3600, httpOnly = false } = {}) {
  const current = response.getHeader("Set-Cookie");
  const cookie = `${name}=${encodeURIComponent(value)}; Path=/; Max-Age=${maxAge}${httpOnly ? "; HttpOnly" : ""}${cookieSuffix(request)}`;
  response.setHeader("Set-Cookie", current ? [...[].concat(current), cookie] : cookie);
}

function clearCookie(response, request, name, httpOnly = false) {
  const current = response.getHeader("Set-Cookie");
  const cookie = `${name}=; Path=/; Max-Age=0${httpOnly ? "; HttpOnly" : ""}${cookieSuffix(request)}`;
  response.setHeader("Set-Cookie", current ? [...[].concat(current), cookie] : cookie);
}

function randomToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString("base64url");
}

function digest(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function safeEqual(left, right) {
  if (!left || !right) return false;
  const a = Buffer.from(String(left));
  const b = Buffer.from(String(right));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function issueCsrf(request, response) {
  const token = randomToken(24);
  addCookie(response, request, CSRF_COOKIE, token, { maxAge: 3600 });
  return token;
}

function validateCsrf(request, response) {
  if (!safeEqual(cookieMap(request)[CSRF_COOKIE], request.headers["x-csrf-token"])) {
    fail(response, 403, "Your security check expired. Refresh the page and try again.", "csrf_failed");
    return false;
  }
  return true;
}

async function readJson(request) {
  const chunks = [];
  let length = 0;
  for await (const chunk of request) {
    length += chunk.length;
    if (length > 65536) throw Object.assign(new Error("Request is too large."), { statusCode: 413 });
    chunks.push(chunk);
  }
  if (!length) return {};
  try {
    const value = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (!value || Array.isArray(value) || typeof value !== "object") throw new Error();
    return value;
  } catch {
    throw Object.assign(new Error("Invalid JSON request."), { statusCode: 400 });
  }
}

async function readBuffer(request, maxBytes) {
  const chunks = []; let length = 0;
  for await (const chunk of request) {
    length += chunk.length;
    if (length > maxBytes) throw Object.assign(new Error("That file is too large."), { statusCode: 413 });
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

function text(value, max, label, required = true) {
  if (typeof value !== "string") {
    if (!required && (value === null || value === undefined)) return "";
    throw Object.assign(new Error(`${label} is required.`), { statusCode: 400 });
  }
  const trimmed = value.trim();
  if (required && !trimmed) throw Object.assign(new Error(`${label} is required.`), { statusCode: 400 });
  if (trimmed.length > max) throw Object.assign(new Error(`${label} is too long.`), { statusCode: 400 });
  return trimmed;
}

function email(value) {
  const normalized = text(value, 254, "Email").toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) throw Object.assign(new Error("Enter a valid email address."), { statusCode: 400 });
  return normalized;
}

function password(value) {
  if (typeof value !== "string" || value.length < 8 || value.length > 128 || Buffer.byteLength(value, "utf8") > 72) {
    throw Object.assign(new Error("Password must be at least 8 characters and no more than 72 UTF-8 bytes."), { statusCode: 400 });
  }
  return value;
}

function passwordForHash(value) {
  if (typeof value !== "string" || value.length < 8 || value.length > 128 || Buffer.byteLength(value, "utf8") > 72) {
    throw Object.assign(new Error("Password must be at least 8 characters and no more than 72 UTF-8 bytes."), { statusCode: 400 });
  }
  return value;
}

function expiryDate(days) {
  return new Date(Date.now() + days * 86400000).toISOString().slice(0, 19).replace("T", " ");
}

function safeUser(row) {
  return { id: Number(row.id), email: row.email, name: row.full_name, accountType: row.account_type };
}

async function currentUser(request, pool) {
  const token = cookieMap(request)[SESSION_COOKIE];
  if (!token || token.length > 128) return null;
  const [rows] = await pool.execute(
    `SELECT u.id,u.email,u.full_name,u.account_type FROM sessions s
     JOIN users u ON u.id=s.user_id
     LEFT JOIN customer_account_suspensions ca ON ca.user_id=u.id
     WHERE s.token_hash=? AND s.expires_at>now() AND u.active=1
       AND (u.account_type<>'customer' OR ca.user_id IS NULL OR (ca.permanent=0 AND ca.suspended_until IS NOT NULL AND ca.suspended_until<=now()))
     LIMIT 1`,
    [digest(token)]
  );
  return rows[0] || null;
}

async function startSession(request, response, pool, userId, remember = false) {
  const token = randomToken();
  const days = remember ? 30 : 1;
  await pool.execute("INSERT INTO sessions (token_hash,user_id,expires_at) VALUES (?,?,?)", [digest(token), userId, expiryDate(days)]);
  addCookie(response, request, SESSION_COOKIE, token, { maxAge: days * 86400, httpOnly: true });
}

async function endSession(request, response, pool) {
  const token = cookieMap(request)[SESSION_COOKIE];
  if (token) await pool.execute("DELETE FROM sessions WHERE token_hash=?", [digest(token)]);
  clearCookie(response, request, SESSION_COOKIE, true);
  clearCookie(response, request, CSRF_COOKIE, false);
}

async function activity(pool, actorId, event, details = "") {
  await pool.execute("INSERT INTO activity_logs (actor_user_id,event_type,details) VALUES (?,?,?)", [actorId || null, event, String(details).slice(0, 500)]);
}

async function requireUser(request, response, pool, allowed = ["owner", "seller"]) {
  const user = await currentUser(request, pool);
  if (!user) { fail(response, 401, "Sign in to continue.", "authentication_required"); return null; }
  if (!allowed.includes(user.account_type)) { fail(response, 403, "This account does not have access to that action.", "forbidden"); return null; }
  return user;
}

module.exports = {
  SESSION_COOKIE, CSRF_COOKIE, json, fail, cookieMap, addCookie, clearCookie, randomToken, digest,
  issueCsrf, validateCsrf, readJson, readBuffer, text, email, password, passwordForHash, safeUser, currentUser,
  startSession, endSession, activity, requireUser, expiryDate
};
