'use strict';
/* ==========================================================================
   BookHaven — database layer
   Transparently talks to one of two backends:
     - Supabase (Postgres)  when DATABASE_URL is set (recommended for hosting)
     - the local SQLite file when it is empty (default for development)
   The rest of the app only uses these helpers, so switching backends means
   setting one environment variable:
       db.get(sql, params)                         first row (or null)
       db.all(sql, params)                         all rows
       db.run(sql, params)                         { lastInsertRowid, changes }
       db.exec(sql)                                raw statement(s) (DDL…)
       db.withTransaction(async (t) => { … })      helpers inside a transaction
   The SQL is engine-agnostic: '?' placeholders become $1/$2… for Postgres.
   ========================================================================== */

const path = require('path');

const DATABASE_URL = String(process.env.DATABASE_URL || '').trim();
const isPostgres = !!DATABASE_URL;

const SQLITE_DDL = `
  CREATE TABLE IF NOT EXISTS books (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    title     TEXT NOT NULL,
    author    TEXT NOT NULL,
    category  TEXT NOT NULL,
    subcategory TEXT DEFAULT '',
    description TEXT DEFAULT '',
    cover     TEXT,
    price     REAL NOT NULL,
    oldPrice  REAL,
    stock     INTEGER DEFAULT 20,
    rating    REAL DEFAULT 0,
    reviews   INTEGER DEFAULT 0,
    featured  INTEGER DEFAULT 0,
    bestseller INTEGER DEFAULT 0,
    isNew     INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    name          TEXT NOT NULL,
    email         TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    salt          TEXT NOT NULL,
    role          TEXT NOT NULL DEFAULT 'customer',
    provider      TEXT DEFAULT '',
    provider_id   TEXT DEFAULT '',
    created_at    TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS sessions (
    token      TEXT PRIMARY KEY,
    user_id    INTEGER NOT NULL REFERENCES users(id),
    expires_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS orders (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    order_ref  TEXT NOT NULL UNIQUE,
    customer   TEXT NOT NULL,
    email      TEXT NOT NULL,
    date       TEXT NOT NULL,
    items      INTEGER NOT NULL,
    total      REAL NOT NULL,
    status     TEXT NOT NULL DEFAULT 'Processing',
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS contact_messages (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT NOT NULL,
    email      TEXT NOT NULL,
    subject    TEXT DEFAULT '',
    message    TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
  );
`;

let sqlite = null;
let pool = null;

if (isPostgres) {
  const { Pool, types } = require('pg');
  /* Postgres returns BIGINT (including id columns, COUNT(*) and MAX(id)) as
     strings by default. Parse them back to numbers so ids and arithmetic
     (e.g. the BH-xxxx order reference) behave exactly like SQLite's integers. */
  types.setTypeParser(types.builtins.INT8, (v) => (v === '' || v === null ? v : parseInt(v, 10)));
  pool = new Pool({
    connectionString: DATABASE_URL,
    /* Supabase exposes the database over TLS. Dedicated/pooler hosts provide
       a fixed self-signed-chain cert, so relax verification (the same trust
       model the Supabase client uses). If the URL already includes sslmode,
       let node-postgres use exactly what was asked for. */
    ssl: DATABASE_URL.includes('sslmode') ? undefined : { rejectUnauthorized: false },
    max: 10
  });
} else if (String(process.env.VERCEL || '').trim() === '1') {
  /* Serverless hosts (Vercel) mount a read-only filesystem and set
     NODE_ENV=production: the SQLite file cannot be created there, and the
     site needs the persistent Supabase/Postgres database. Failing here with
     a clear message beats an obscure FUNCTION_INVOCATION_FAILED crash. */
  throw new Error(
    'DATABASE_URL is required on Vercel — add it to Project Settings → Environment Variables ' +
    '(see README → Deploying on Vercel). The local SQLite file cannot be used in serverless functions.'
  );
} else {
  const { DatabaseSync } = require('node:sqlite');
  sqlite = new DatabaseSync(path.resolve(process.env.DB_PATH || path.join(__dirname, 'books.db')));
  sqlite.exec(SQLITE_DDL);
  migrateSqlite();
}

/* Column migrations for databases created before these columns existed. */
function migrateSqlite() {
  const cols = (table) => sqlite.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name);
  const ensure = (table, column, ddl) => {
    if (!cols(table).includes(column)) sqlite.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${ddl}`);
  };
  ensure('books', 'subcategory', 'TEXT DEFAULT \'\'');
  ensure('books', 'description', 'TEXT DEFAULT \'\'');
  ensure('books', 'stock', 'INTEGER DEFAULT 20');
  ensure('users', 'provider', 'TEXT DEFAULT \'\'');
  ensure('users', 'provider_id', 'TEXT DEFAULT \'\'');
}

/* Which column holds the primary key for INSERT...RETURNING per table. */
const pkByTable = { sessions: 'token' };

/* Shared SQL -> Postgres: quote the two mixed-case columns that exist in the
   schema, swap ? for $1..$n and return the inserted primary key. */
function toPgSql(rawSql) {
  let sql = String(rawSql)
    .replace(/\b(oldPrice|isNew)\b/g, '"$1"')
    .replace(/\?/g, (() => { let i = 0; return () => '$' + (++i); })());

  const m = /^\s*insert\s+into\s+([\w"]+)/i.exec(sql);
  if (m && !/\sreturning\s/i.test(sql)) {
    const table = m[1].replace(/"/g, '').toLowerCase();
    sql += ' RETURNING ' + (pkByTable[table] || 'id');
  }
  return sql;
}

async function pgResult(res) {
  const row = res.rows && res.rows[0];
  return {
    lastInsertRowid: row ? row[Object.keys(row)[0]] ?? null : null,
    changes: typeof res.rowCount === 'number' ? res.rowCount : 0
  };
}

/* Executes a statement on a Postgres client (pool or transaction client). */
function runPg(client, sql, params) {
  return client.query({ text: toPgSql(sql), values: params });
}

/* ---------- Public API ---------- */
async function get(sql, params = []) {
  const rows = await all(sql, params);
  return rows[0] || null;
}

async function all(sql, params = []) {
  if (isPostgres) {
    const res = await pool.query({ text: toPgSql(sql), values: params });
    return res.rows;
  }
  if (params.length) return sqlite.prepare(sql).all(...params);
  return sqlite.prepare(sql).all();
}

async function run(sql, params = []) {
  if (isPostgres) {
    const res = await pool.query({ text: toPgSql(sql), values: params });
    return pgResult(res);
  }
  const info = sqlite.prepare(sql).run(...params);
  return { lastInsertRowid: info.lastInsertRowid, changes: info.changes };
}

async function exec(sql) {
  if (isPostgres) await pool.query(sql);
  else sqlite.exec(sql);
}

async function withTransaction(fn) {
  const tx = (client) => ({
    get: async (sql, params = []) => {
      if (isPostgres) {
        const res = await runPg(client, sql, params);
        return res.rows[0] || null;
      }
      return runTxSqlite(client, sql, params, true);
    },
    all: async (sql, params = []) => {
      if (isPostgres) {
        const res = await runPg(client, sql, params);
        return res.rows;
      }
      return runTxSqlite(client, sql, params, false);
    },
    run: async (sql, params = []) => {
      if (isPostgres) {
        const res = await runPg(client, sql, params);
        return pgResult(res);
      }
      const info = client.prepare(sql).run(...params);
      return { lastInsertRowid: info.lastInsertRowid, changes: info.changes };
    },
    exec: async (stmt) => {
      if (isPostgres) await client.query(stmt);
      else client.exec(stmt);
    }
  });

  /* SQLite has one connection; "client" is the sqlite handle itself. */
  if (isPostgres) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const value = await fn(tx(client));
      await client.query('COMMIT');
      return value;
    } catch (err) {
      try { await client.query('ROLLBACK'); } catch (e) { /* ignore */ }
      throw err;
    } finally {
      client.release();
    }
  }

  sqlite.exec('BEGIN');
  try {
    const value = await fn(tx(sqlite));
    sqlite.exec('COMMIT');
    return value;
  } catch (err) {
    sqlite.exec('ROLLBACK');
    throw err;
  }
}

/* SQLite get/all against a transaction handle (single connection). */
function runTxSqlite(sqliteHandle, sql, params, getOne) {
  const stmt = sqliteHandle.prepare(sql);
  const rows = params.length ? stmt.all(...params) : stmt.all();
  return getOne ? (rows[0] || null) : rows;
}

/* Light "is the database reachable?" check used at startup. */
async function ping() {
  if (isPostgres) await pool.query('SELECT 1');
}

module.exports = { isPostgres, get, all, run, exec, withTransaction, ping };