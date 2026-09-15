/* ==========================================================================
   BookHaven — Backend server (Node.js + Express + SQLite)
   - Serves the static frontend (HTML/CSS/JS/images) — only public files
     are served; server code, the database and config stay private.
   - Injects /config.js (window.__BOOKHAVEN_CONFIG__) so the frontend knows
     the public site URL for error banners.
   - REST API:
       GET    /api/books            list all books
       GET    /api/books/:id        one book
       POST   /api/books            create a book (admin)
       PUT    /api/books/:id        update a book (admin)
       DELETE /api/books/:id        delete a book (admin)
       GET    /api/categories       categories + subcategories
       POST   /api/upload           upload a cover image (admin)
       POST   /api/orders           place an order (public)
       GET    /api/orders           list orders (admin)
   - Database auto-creates (books.db) and seeds on first run.
   - All config comes from environment variables (.env file optional).
     ADMIN_EMAIL/ADMIN_PASSWORD are REQUIRED when NODE_ENV=production.
   Run with:  npm install  &&  npm start
   ========================================================================== */
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const { DatabaseSync } = require('node:sqlite');

/* ---------- 00. Environment configuration ---------- */
/* Optional .env file (never committed). Real .env values via '$PORT' etc. */
(function loadDotEnv() {
  try {
    const p = path.join(__dirname, '.env');
    if (!fs.existsSync(p)) return;
    for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
      if (m && !(m[1] in process.env)) {
        process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
      }
    }
  } catch (e) { /* ignore malformed .env */ }
})();

const NODE_ENV = process.env.NODE_ENV || 'development';
const PORT = Number(process.env.PORT) || 3000;
/* Public base URL of the live site (Render sets this; shown to users in
   error banners instead of a hardcoded localhost address). */
const SITE_URL = String(process.env.SITE_URL || '').trim().replace(/\/+$/, '');
const DB_PATH = path.resolve(process.env.DB_PATH || path.join(__dirname, 'books.db'));

/* Admin credentials. Never ship real credentials in the source tree:
   in production they MUST come from the environment or the server refuses
   to start. Locally (no NODE_ENV) the historical dev defaults are kept so
   `npm start` keeps working unchanged. */
let ADMIN_EMAIL = String(process.env.ADMIN_EMAIL || '').trim().toLowerCase();
let ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';
if (NODE_ENV === 'production' && (!ADMIN_EMAIL || !ADMIN_PASSWORD)) {
  console.error('Refusing to start: ADMIN_EMAIL and ADMIN_PASSWORD must be set in production (Render -> Settings -> Environment).');
  process.exit(1);
}
if (!ADMIN_EMAIL) ADMIN_EMAIL = 'ebubegift4199@gmail.com';
if (!ADMIN_PASSWORD) ADMIN_PASSWORD = 'Oluebubegift';
const ADMIN_NAME = process.env.ADMIN_NAME || 'BookHaven Admin';
const TOKEN_TTL_MS = (Number(process.env.SESSION_TTL_DAYS) || 30) * 24 * 60 * 60 * 1000;
const CORS_ORIGIN = process.env.CORS_ORIGIN || '';             // '' = same origin, '*' = any, or an exact origin
const UPLOAD_DIR = path.resolve(process.env.UPLOAD_DIR || path.join(__dirname, 'uploads'));
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

/* ---------- 01. Database ---------- */
const db = new DatabaseSync(DB_PATH);

db.exec(`
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
`);

/* Lightweight migration for databases created before these columns existed */
function ensureColumn(table, column, ddl) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name);
  if (!cols.includes(column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${ddl}`);
}
ensureColumn('books', 'subcategory', 'TEXT DEFAULT \'\'');
ensureColumn('books', 'description', 'TEXT DEFAULT \'\'');
ensureColumn('books', 'stock', 'INTEGER DEFAULT 20');

const SEED_JSON_PATH = path.join(__dirname, 'scripts', 'seed-data.json');
let SEED_BOOKS = [];
try {
  if (fs.existsSync(SEED_JSON_PATH)) {
    SEED_BOOKS = JSON.parse(fs.readFileSync(SEED_JSON_PATH, 'utf8'));
    if (!Array.isArray(SEED_BOOKS) || !SEED_BOOKS.length) SEED_BOOKS = [];
  }
} catch (e) {
  console.error('Failed to load seed data:', e.message);
}
if (!SEED_BOOKS.length) {
  SEED_BOOKS = [
    { title: 'The Midnight Library', author: 'Matt Haig', category: "Fiction", cover: 'assets/covers/midnight-library.jpg', price: 14990, oldPrice: 19990, rating: 4.6, reviews: 18423, featured: true, bestseller: true, isNew: false },
    { title: 'The Silent Patient', author: 'Alex Michaelides', category: "Fiction", cover: 'assets/covers/silent-patient.jpg', price: 12990, oldPrice: null, rating: 4.4, reviews: 19783, featured: true, bestseller: false, isNew: false }
  ];
}

const SUBGENRE_BY_CAT = {
  "Fiction":    ['Mystery, Thriller & Suspense', 'Fantasy', 'Literary Fiction', 'Historical Fiction'],
  'Science':    ['Physics', 'Popular Science', 'Mathematics', 'Astronomy'],
  'Business':   ['Entrepreneurship', 'Finance', 'Leadership', 'Personal Development'],
  'Technology': ['Programming', 'Software Engineering', 'Artificial Intelligence'],
  'Romance':    ['Contemporary Romance', 'Romance Fiction', 'Young Adult'],
  "Children's": ['Teen Fiction', 'Picture Books', 'Classic Kids'],
  'History':    ['World History', 'Ancient Civilizations', 'Modern History', 'Military History'],
  'Young Adult': ['Contemporary YA', 'Fantasy YA', 'Romance YA', 'Sci-Fi YA'],
  'Self-Help':  ['Personal Development', 'Motivation', 'Mindfulness', 'Productivity'],
  'Biography':  ['Autobiography', 'Memoir', 'Political Figures', 'Business Leaders'],
  'Cook Books & Wine': ['Baking & Desserts', 'Everyday Cooking', 'International Cuisine', 'Wine & Spirits']
};

/* Autogenerated extras for seed books so every row has description,
   subcategory and stock — the admin panel can edit them afterwards. */
function seedMeta(book, i) {
  const subs = SUBGENRE_BY_CAT[book.category] || ['General'];
  return {
    subcategory: subs[i % subs.length],
    description: `"${book.title}" by ${book.author} is a ${book.rating}-star ${book.category} favourite loved by readers everywhere.`,
    stock: 5 + ((i * 7) % 41)
  };
}

/* Insert a batch of seed books inside a single transaction for speed. */
function seedBooksIfEmpty() {
  const bookCount = db.prepare('SELECT COUNT(*) AS n FROM books').get().n;
  if (bookCount > 0) return;

  const insert = db.prepare(`
    INSERT INTO books (title, author, category, subcategory, description, cover, price, oldPrice, stock, rating, reviews, featured, bestseller, isNew)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  db.exec('BEGIN');
  try {
    for (const [i, b] of SEED_BOOKS.entries()) {
      const m = seedMeta(b, i);
      insert.run(
        b.title,
        b.author,
        b.category,
        b.subcategory || m.subcategory,
        b.description || m.description,
        b.cover,
        b.price,
        b.oldPrice != null ? b.oldPrice : null,
        b.stock != null ? b.stock : m.stock,
        b.rating || 0,
        b.reviews || 0,
        b.featured ? 1 : 0,
        b.bestseller ? 1 : 0,
        b.isNew ? 1 : 0
      );
    }
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
  console.log(`Seeded database with ${SEED_BOOKS.length} books.`);
}

seedBooksIfEmpty();

/* Any legacy rows missing values after a migration get sensible defaults,
   varied per book so genres stay representative. */
{
  const rows = db.prepare(`
    SELECT id, category, title FROM books
    WHERE TRIM(COALESCE(subcategory, '')) = '' OR stock IS NULL
       OR TRIM(COALESCE(description, '')) = ''
  `).all();
  const fix = db.prepare('UPDATE books SET subcategory = ?, description = ?, stock = ? WHERE id = ?');
  const seen = {};
  for (const r of rows) {
    const subs = SUBGENRE_BY_CAT[r.category] || ['General'];
    const i = seen[r.category] = (seen[r.category] || 0) + 1;
    fix.run(
      subs[i % subs.length],
      `"${r.title}" — a BookHaven favourite.`,
      r.stock == null ? 5 + ((i * 7) % 41) : r.stock,
      r.id
    );
  }
  if (rows.length) console.log(`Backfilled missing fields for ${rows.length} books.`);
}

/* ----- Admin account (seeded once — change via env vars or the users table) ----- */
const adminCount = db.prepare("SELECT COUNT(*) AS n FROM users WHERE role = 'admin'").get().n;
if (adminCount === 0) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = hashPassword(ADMIN_PASSWORD, salt);
  db.prepare('INSERT INTO users (name, email, password_hash, salt, role) VALUES (?, ?, ?, ?, ?)')
    .run(ADMIN_NAME, ADMIN_EMAIL, hash, salt, 'admin');
  console.log(`Seeded admin account: ${ADMIN_EMAIL}`);
}

function hashPassword(password, salt) {
  return crypto.scryptSync(password, salt, 64).toString('hex');
}

function verifyPassword(password, salt, hash) {
  const test = crypto.scryptSync(password, salt, 64);
  const expected = Buffer.from(hash, 'hex');
  return test.length === expected.length && crypto.timingSafeEqual(test, expected);
}

function createSession(userId) {
  const token = crypto.randomBytes(32).toString('hex');
  const expires = new Date(Date.now() + TOKEN_TTL_MS).toISOString();
  db.prepare('INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)').run(token, userId, expires);
  return token;
}

function getUserByToken(token) {
  if (!token) return null;
  const row = db.prepare(`
    SELECT u.id, u.name, u.email, u.role
    FROM sessions s JOIN users u ON u.id = s.user_id
    WHERE s.token = ? AND s.expires_at > ?
  `).get(token, new Date().toISOString());
  return row || null;
}

const bearerUser = (req) => getUserByToken(String(req.headers.authorization || '').replace(/^Bearer\s+/i, ''));

function requireAdmin(req, res, next) {
  const user = bearerUser(req);
  if (!user || user.role !== 'admin') return res.status(401).json({ error: 'Unauthorized — admin login required' });
  req.user = user;
  next();
}

/* ---------- 02. Helpers ---------- */
const rowToBook = (r) => ({
  id: r.id,
  title: r.title,
  author: r.author,
  category: r.category,
  subcategory: r.subcategory || '',
  description: r.description || '',
  cover: r.cover,
  price: r.price,
  oldPrice: r.oldPrice,
  stock: r.stock == null ? 20 : r.stock,
  rating: r.rating,
  reviews: r.reviews,
  featured: !!r.featured,
  bestseller: !!r.bestseller,
  isNew: !!r.isNew
});

function parseBookBody(body) {
  const b = body || {};
  const num = (v) => (v === '' || v === null || v === undefined ? null : Number(v));
  const bool = (v) => !!v;
  const price = num(b.price);
  const stock = num(b.stock);

  if (!b.title || !String(b.title).trim()) throw new Error('Title is required');
  if (!b.author || !String(b.author).trim()) throw new Error('Author is required');
  if (price === null || isNaN(price) || price < 0) throw new Error('A valid price is required');
  if (stock !== null && (isNaN(stock) || stock < 0)) throw new Error('Stock must be zero or more');

  return {
    title: String(b.title).trim(),
    author: String(b.author).trim(),
    category: String(b.category || 'Fiction').trim(),
    subcategory: String(b.subcategory || '').trim(),
    description: String(b.description || '').trim(),
    cover: String(b.cover || '').trim(),
    price,
    oldPrice: num(b.oldPrice),
    stock: stock === null ? 20 : Math.round(stock),
    rating: Math.min(5, Math.max(0, num(b.rating) || 0)),
    reviews: Math.max(0, Math.round(num(b.reviews) || 0)),
    featured: bool(b.featured),
    bestseller: bool(b.bestseller),
    isNew: bool(b.isNew)
  };
}

/* ---------- 03. App ---------- */
const app = express();
app.set('trust proxy', 1); /* Read the real client IP through Render/Heroku-style proxies */
app.use(express.json({ limit: '8mb' }));

/* Runtime config injected into every page (loaded before js/api-config.js).
   Controls the site URL shown in error banners on the live site. */
app.get('/config.js', (req, res) => {
  res.type('application/javascript');
  res.set('Cache-Control', 'no-store');
  res.send(`window.__BOOKHAVEN_CONFIG__ = ${JSON.stringify({ SITE_URL: SITE_URL || '', API_BASE_URL: '' })};`);
});

/* Hidden admin entry: reached via the BookHaven logo in the page footer.
   The plain /admin.html path is not served, so the panel stays out of
   sight — admin-auth.js shows a login screen here and reveals the panel
   only after a successful admin sign-in. */
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'admin.html'));
});

/* Lock down static file serving: only the public HTML pages and the
   public asset folders are reachable. server.js, books.db, package.json,
   .env.example, start.bat and everything else at the project root stays
   private even if its filename is guessed. */
const PUBLIC_PAGES = [
  'index.html', 'about.html', 'about-us.html', 'account.html', 'bestsellers.html',
  'contact.html', 'careers.html', 'cart.html', 'categories.html', 'checkout.html',
  'deals.html', 'faq.html', 'new-releases.html', 'our-story.html',
  'privacy-policy.html', 'privacy.html', 'returns.html', 'shipping.html',
  'terms.html', 'terms-of-service.html', 'track-order.html', 'wishlist.html'
];
const PUBLIC_DIRS = ['/css', '/js', '/assets', '/img', '/uploads'];
app.use((req, res, next) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') return next();
  if (req.path.startsWith('/api/')) return next();
  let p = req.path;
  try { p = decodeURIComponent(p); } catch (e) { /* keep raw path */ }
  const norm = path.posix.normalize(p).replace(/\\/g, '/');
  if (norm === '/' || norm === '/index.html') return next();
  const first = '/' + (norm.split('/')[1] || '');
  if (PUBLIC_PAGES.includes(norm.replace(/^\//, ''))) return next();
  if (PUBLIC_DIRS.includes(first) && norm !== first) return next();
  return res.status(404).json({ error: 'Not found' });
});

app.use(express.static(path.join(__dirname), {
  /* CSS/JS/HTML must revalidate on every load so the browser can never keep
     serving a stale (pre-responsive) stylesheet or stale scripts. */
  setHeaders(res, filePath) {
    if (/\.(css|js|html|svg|json|webmanifest)$/i.test(filePath)) {
      res.set('Cache-Control', 'no-cache');
    }
  }
}));
app.use('/uploads', express.static(UPLOAD_DIR));

/* Never cache API responses so admin-panel edits show up immediately. */
/* CORS: allow the storefront (possibly hosted elsewhere) to call the API.
   In development, preview pages opened from loopback origins (e.g. VS Code
   Live Server at http://127.0.0.1:5500) are allowed automatically; in
   production only an explicitly configured CORS_ORIGIN is honoured. */
function isLoopbackOrigin(origin) {
  try {
    const h = new URL(origin).hostname;
    return h === 'localhost' || h === '127.0.0.1' || h === '::1';
  } catch (e) { return false; }
}
app.use('/api', (req, res, next) => {
  res.set('Cache-Control', 'no-store');
  const origin = req.headers.origin;
  const allow = (CORS_ORIGIN === '*' || (CORS_ORIGIN && origin === CORS_ORIGIN) ||
    (NODE_ENV !== 'production' && origin && isLoopbackOrigin(origin)));
  if (origin && allow) {
    res.set('Access-Control-Allow-Origin', CORS_ORIGIN === '*' ? '*' : origin);
    res.set('Vary', 'Origin');
    res.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  }
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

/* Simple in-memory login throttle (10 attempts / 15 minutes per IP). */
const loginAttempts = new Map();
function loginLimiter(req, res, next) {
  const key = String(req.ip || req.socket.remoteAddress || 'unknown');
  const now = Date.now();
  const entry = loginAttempts.get(key) || { count: 0, reset: now + 15 * 60 * 1000 };
  if (now > entry.reset) { entry.count = 0; entry.reset = now + 15 * 60 * 1000; }
  if (entry.count >= 10) return res.status(429).json({ error: 'Too many sign-in attempts. Please try again in 15 minutes.' });
  entry.count += 1;
  loginAttempts.set(key, entry);
  next();
}

/* ----- Books API ----- */
app.get('/api/books', (req, res) => {
  const rows = db.prepare('SELECT * FROM books ORDER BY id').all();
  res.json(rows.map(rowToBook));
});

app.get('/api/books/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM books WHERE id = ?').get(Number(req.params.id));
  if (!row) return res.status(404).json({ error: 'Book not found' });
  res.json(rowToBook(row));
});

/* Categories + subgenres derived from the database (single source of truth) */
app.get('/api/categories', (req, res) => {
  const rows = db.prepare(`
    SELECT category, subcategory FROM books
    WHERE subcategory IS NOT NULL AND TRIM(subcategory) != ''
    GROUP BY category, subcategory ORDER BY category, subcategory
  `).all();
  const byCat = {};
  for (const r of rows) {
    if (!byCat[r.category]) byCat[r.category] = [];
    byCat[r.category].push(r.subcategory);
  }
  for (const c of db.prepare('SELECT DISTINCT category FROM books ORDER BY category').all()) {
    if (!byCat[c.category]) byCat[c.category] = [];
  }
  res.json(byCat);
});

app.post('/api/books', requireAdmin, (req, res) => {
  try {
    const b = parseBookBody(req.body);
    const info = db.prepare(`
      INSERT INTO books (title, author, category, subcategory, description, cover, price, oldPrice, stock, rating, reviews, featured, bestseller, isNew)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(b.title, b.author, b.category, b.subcategory, b.description, b.cover, b.price, b.oldPrice, b.stock, b.rating, b.reviews, b.featured ? 1 : 0, b.bestseller ? 1 : 0, b.isNew ? 1 : 0);
    const row = db.prepare('SELECT * FROM books WHERE id = ?').get(Number(info.lastInsertRowid));
    res.status(201).json(rowToBook(row));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.put('/api/books/:id', requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const exists = db.prepare('SELECT id FROM books WHERE id = ?').get(id);
  if (!exists) return res.status(404).json({ error: 'Book not found' });
  try {
    const b = parseBookBody(req.body);
    db.prepare(`
      UPDATE books SET title = ?, author = ?, category = ?, subcategory = ?, description = ?,
             cover = ?, price = ?, oldPrice = ?, stock = ?, rating = ?, reviews = ?,
             featured = ?, bestseller = ?, isNew = ?
      WHERE id = ?
    `).run(b.title, b.author, b.category, b.subcategory, b.description, b.cover, b.price, b.oldPrice, b.stock, b.rating, b.reviews, b.featured ? 1 : 0, b.bestseller ? 1 : 0, b.isNew ? 1 : 0, id);
    const row = db.prepare('SELECT * FROM books WHERE id = ?').get(id);
    res.json(rowToBook(row));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.delete('/api/books/:id', requireAdmin, (req, res) => {
  const info = db.prepare('DELETE FROM books WHERE id = ?').run(Number(req.params.id));
  if (info.changes === 0) return res.status(404).json({ error: 'Book not found' });
  res.json({ ok: true });
});

/* ----- Cover image upload (admin). Accepts a base64 data URL, stores the
   file on the server and returns the public /uploads URL to save in the DB. */
const IMAGE_RE = /^data:image\/(png|jpe?g|gif|webp);base64,/;
const IMAGE_EXTS = { png: '.png', jpeg: '.jpg', jpg: '.jpg', gif: '.gif', webp: '.webp' };
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

app.post('/api/upload', requireAdmin, (req, res) => {
  try {
    const { data } = req.body || {};
    if (!data || typeof data !== 'string' || !IMAGE_RE.test(data)) {
      return res.status(400).json({ error: 'A base64 PNG, JPG, GIF or WEBP image is required' });
    }
    const m = data.match(/^data:image\/(png|jpe?g|gif|webp);base64,(.*)$/s);
    const buf = Buffer.from(m[2], 'base64');
    if (buf.length > MAX_IMAGE_BYTES) return res.status(400).json({ error: 'Image must be 5 MB or less' });
    if (!buf.length) return res.status(400).json({ error: 'Image is empty' });
    const name = Date.now() + '-' + crypto.randomBytes(4).toString('hex') + IMAGE_EXTS[m[1]];
    fs.writeFileSync(path.join(UPLOAD_DIR, name), buf);
    res.json({ url: '/uploads/' + name });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/* ----- Orders API -----
   Creation is public (the shopper). Listing is admin-only. The database is
   the source of truth; the frontend keeps a localStorage mirror so the
   admin panel still shows recent orders when the API is unreachable. */
app.post('/api/orders', (req, res) => {
  const { customer, email, items, total } = req.body || {};
  if (!customer || !String(customer).trim()) return res.status(400).json({ error: 'Customer name is required' });
  if (!/^\S+@\S+\.\S+$/.test(String(email || ''))) return res.status(400).json({ error: 'A valid email is required' });
  const qty = Number(items);
  const amount = Number(total);
  if (!Number.isInteger(qty) || qty < 1) return res.status(400).json({ error: 'The number of items is required' });
  if (!(amount >= 0) || isNaN(amount)) return res.status(400).json({ error: 'A valid order total is required' });

  const max = db.prepare('SELECT MAX(id) AS m FROM orders').get();
  const ref = 'BH-' + (1046 + ((max.m || 0) + 1));
  const info = db.prepare(`
    INSERT INTO orders (order_ref, customer, email, date, items, total) VALUES (?, ?, ?, ?, ?, ?)
  `).run(ref, String(customer).trim(), String(email).trim().toLowerCase(), new Date().toISOString().slice(0, 10), qty, Math.round(amount * 100) / 100);
  const row = db.prepare('SELECT * FROM orders WHERE id = ?').get(Number(info.lastInsertRowid));
  res.status(201).json(row);
});

/* Public order lookup for the Track Your Order page. Requires BOTH the
   order reference and the email used at checkout, so orders cannot be
   enumerated by guessing references alone. */
app.get('/api/orders/lookup', (req, res) => {
  const ref = String(req.query.ref || '').trim().toUpperCase();
  const email = String(req.query.email || '').trim().toLowerCase();
  if (!/^BH-\d+$/.test(ref)) return res.status(400).json({ error: 'Enter an order reference like BH-1047.' });
  if (!/^\S+@\S+\.\S+$/.test(email)) return res.status(400).json({ error: 'Enter the email you used at checkout.' });
  const row = db.prepare(
    'SELECT order_ref, customer, date, items, total, status FROM orders WHERE UPPER(order_ref) = ? AND email = ?'
  ).get(ref, email);
  if (!row) return res.status(404).json({ error: 'No order matches that reference and email. Double-check both and try again.' });
  res.json(row);
});

app.get('/api/orders', requireAdmin, (req, res) => {
  res.json(db.prepare('SELECT * FROM orders ORDER BY id DESC').all());
});

/* ----- Auth API ----- */
app.post('/api/auth/register', (req, res) => {
  const { name, email, password } = req.body || {};
  if (!name || !String(name).trim()) return res.status(400).json({ error: 'Name is required' });
  if (!/^\S+@\S+\.\S+$/.test(email || '')) return res.status(400).json({ error: 'A valid email is required' });
  if (!password || String(password).length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });

  const exists = db.prepare('SELECT id FROM users WHERE email = ?').get(String(email).trim().toLowerCase());
  if (exists) return res.status(409).json({ error: 'An account with this email already exists' });

  const salt = crypto.randomBytes(16).toString('hex');
  const hash = hashPassword(password, salt);
  const info = db.prepare('INSERT INTO users (name, email, password_hash, salt, role) VALUES (?, ?, ?, ?, ?)')
    .run(String(name).trim(), String(email).trim().toLowerCase(), hash, salt, 'customer');

  const token = createSession(Number(info.lastInsertRowid));
  res.status(201).json({
    token,
    user: { id: Number(info.lastInsertRowid), name: String(name).trim(), email: String(email).trim().toLowerCase(), role: 'customer' }
  });
});

app.post('/api/auth/login', loginLimiter, (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'Email and password are required' });

  const row = db.prepare('SELECT * FROM users WHERE email = ?').get(String(email).trim().toLowerCase());
  if (!row || !verifyPassword(String(password), row.salt, row.password_hash)) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }

  const token = createSession(row.id);
  res.json({ token, user: { id: row.id, name: row.name, email: row.email, role: row.role } });
});

app.post('/api/auth/logout', (req, res) => {
  const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (token) db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
  res.json({ ok: true });
});

app.get('/api/auth/me', (req, res) => {
  const user = bearerUser(req);
  if (!user) return res.status(401).json({ error: 'Not signed in' });
  res.json({ user });
});

/* ----- Fallback for SPA-less static pages is not needed; serve index for unknown routes */
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

app.listen(PORT, () => {
  console.log(`BookHaven running at http://localhost:${PORT}`);
  console.log(`Books API: http://localhost:${PORT}/api/books`);
  console.log(`Uploads served from: ${UPLOAD_DIR}`);
});
