// PostgreSQL (Supabase) access layer.
// It exposes the small subset of the mysql2 API that the app uses (pool.execute / pool.query /
// pool.getConnection with beginTransaction/commit/rollback/release) on top of "pg", so the route code stays readable.
const { Pool, types } = require("pg");

// Load local settings from a .env file when one exists (ignored in production hosts).
try { process.loadEnvFile(); } catch { /* no .env file */ }

types.setTypeParser(20, Number);        // bigint (COUNT, SUM, ids) -> JS number
types.setTypeParser(1700, Number);      // numeric (SUM of integers) -> JS number
types.setTypeParser(1082, (value) => value); // date -> "YYYY-MM-DD" string (no timezone shifting)

// Tables whose generated "id" column must be returned as insertId.
const identityTables = new Set(["users", "customers", "inquiries", "stock_movements", "order_items", "activity_logs", "olap_refresh_runs", "newsletter_subscribers", "product_reviews"]);

function createPool() {
  // DATABASE_URL is preferred; the variables added by Vercel's Supabase integration are accepted as fallbacks.
  const source = process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.POSTGRES_URL_NON_POOLING;
  if (!source) throw new Error("DATABASE_URL is required (your Supabase Postgres connection string).");
  const url = new URL(source);
  if (!/^postgres(ql)?:$/.test(url.protocol)) throw new Error("DATABASE_URL must start with postgresql://");
  const local = ["localhost", "127.0.0.1"].includes(url.hostname);
  const ssl = local || process.env.DATABASE_SSL === "disable" ? false
    : process.env.DATABASE_CA ? { ca: process.env.DATABASE_CA.replace(/\\n/g, "\n"), rejectUnauthorized: true }
    : { rejectUnauthorized: false }; // encrypted; set DATABASE_CA (Supabase CA certificate) to also verify the server
  const pgPool = new Pool({
    host: url.hostname,
    port: Number(url.port || 5432),
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: decodeURIComponent(url.pathname.replace(/^\//, "")) || "postgres",
    max: Number(process.env.DATABASE_POOL_MAX || (process.env.VERCEL ? 2 : 10)),
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
    ssl
  });
  pgPool.on("error", (error) => console.error("Idle database client error", error.code || error.name));
  return wrapPool(pgPool);
}

// "?" -> $1,$2 ... (skipping quoted strings) and collect camelCase aliases (Postgres folds unquoted names to lowercase).
function translate(sql) {
  let out = ""; let n = 0; let quote = false;
  for (const ch of sql) {
    if (ch === "'") quote = !quote;
    if (ch === "?" && !quote) { n += 1; out += `$${n}`; } else out += ch;
  }
  const aliases = new Map();
  for (const match of sql.replace(/'[^']*'/g, "''").matchAll(/\b[a-z][a-z0-9]*[A-Z][A-Za-z0-9]*\b/g)) aliases.set(match[0].toLowerCase(), match[0]);
  return { text: out, aliases };
}

function shape(result, aliases, text) {
  if (result.command === "SELECT") {
    const rows = result.rows.map((row) => {
      const next = {};
      for (const key of Object.keys(row)) next[aliases.get(key) || key] = row[key];
      return next;
    });
    return [rows, result.fields];
  }
  const header = { affectedRows: result.rowCount, insertId: undefined };
  if (/\bRETURNING\s+id\b/i.test(text) && result.rows[0]) header.insertId = result.rows[0].id;
  return [header, undefined];
}

async function run(client, sql, params = []) {
  const { text, aliases } = translate(sql);
  let finalText = text;
  const insert = /^\s*INSERT\s+INTO\s+([a-z_]+)/i.exec(text);
  if (insert && identityTables.has(insert[1].toLowerCase()) && !/\bRETURNING\b/i.test(text)) finalText += " RETURNING id";
  const values = params.map((value) => (typeof value === "boolean" ? (value ? 1 : 0) : value));
  try {
    return shape(await client.query(finalText, values), aliases, finalText);
  } catch (error) {
    if (error.code === "23505") error.code = "ER_DUP_ENTRY"; // unique violation (mysql-style code used by the routes)
    throw error;
  }
}

function wrapClient(client) {
  return {
    execute: (sql, params) => run(client, sql, params),
    query: (sql, params) => run(client, sql, params),
    beginTransaction: () => client.query("BEGIN"),
    commit: () => client.query("COMMIT"),
    rollback: () => client.query("ROLLBACK").catch(() => {}),
    release: () => client.release()
  };
}

function wrapPool(pgPool) {
  return {
    execute: (sql, params) => run(pgPool, sql, params),
    query: (sql, params) => run(pgPool, sql, params),
    getConnection: async () => wrapClient(await pgPool.connect()),
    end: () => pgPool.end()
  };
}

async function ensureSchema(pool) {
  try { await pool.query("SELECT 1 FROM users LIMIT 1"); }
  catch (error) {
    if (error.code === "42P01") throw new Error("Database tables are missing. Apply database/supabase_schema.sql (or run: npm run db:setup).");
    throw error;
  }
}

module.exports = { createPool, ensureSchema };
