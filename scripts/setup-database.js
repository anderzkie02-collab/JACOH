// One-command database setup:  npm run db:setup
// 1) applies database/supabase_schema.sql (safe to re-run)  2) seeds Owner/Seller accounts + Drop 06 catalog
//    ONLY if they do not exist yet. Works against Supabase or any PostgreSQL server.
const fs = require("node:fs");
const path = require("node:path");
try { process.loadEnvFile(); } catch { /* no .env file */ }

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is missing. Copy .env.example to .env and paste your Supabase connection string.");
  const { Client } = require("pg");
  const url = new URL(process.env.DATABASE_URL);
  const local = ["localhost", "127.0.0.1"].includes(url.hostname);
  const client = new Client({
    host: url.hostname, port: Number(url.port || 5432), user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password), database: decodeURIComponent(url.pathname.replace(/^\//, "")) || "postgres",
    ssl: local || process.env.DATABASE_SSL === "disable" ? false : { rejectUnauthorized: false }
  });
  await client.connect();
  try {
    await client.query(fs.readFileSync(path.join(__dirname, "..", "database", "supabase_schema.sql"), "utf8"));
    console.log("Tables created / verified.");
    const { rows } = await client.query("SELECT COUNT(*)::int AS n FROM users");
    if (rows[0].n > 0) { console.log("Accounts already exist - skipping seed (nothing was overwritten)."); return; }
  } finally { await client.end(); }
  require("./seed-accounts"); // prints the one-time Owner/Seller passwords
}

main().catch((error) => { console.error("Database setup failed:", error.message); process.exitCode = 1; });
