/* ==========================================================================
   BookHaven — Backend server (Node.js + Express + SQLite or Supabase/Postgres)
   - Serves the static frontend (HTML/CSS/JS/images) — only public files
     are served; server code, the database and config stay private.
   - Injects /config.js (window.__BOOKHAVEN_CONFIG__) so the frontend knows
     the public site URL for error banners.
   - Database: when DATABASE_URL is set the app reads/writes your hosted
     Supabase (PostgreSQL) database (run supabase/schema.sql in the Supabase
     SQL Editor once). Without it, a local SQLite file (books.db) is used as
     the development default. All queries go through db.js, which translates
     them transparently.
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
        POST   /api/contact          send a contact message (public)
        GET    /api/contact          list contact messages (admin)
        DELETE /api/contact/:id      delete a contact message (admin)
   - Database auto-seeds the catalogue + admin account on first run.
   - All config comes from environment variables (.env file optional).
     ADMIN_EMAIL/ADMIN_PASSWORD are REQUIRED when NODE_ENV=production.
   Run with:  npm install  &&  npm start
   ========================================================================== */
'use strict';

const fs = require('fs');
const path = require('path');

/* ---------- 00. Environment configuration ---------- */
/* Optional .env file (never committed). Must run BEFORE db.js is loaded so
   it can see DATABASE_URL. Real .env values via '$PORT' etc. */
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

const crypto = require('crypto');
const express = require('express');
const nodemailer = require('nodemailer');
const db = require('./db.js');

const NODE_ENV = process.env.NODE_ENV || 'development';
const PORT = Number(process.env.PORT) || 3000;
/* Public base URL of the live site (Render sets this; shown to users in
   error banners instead of a hardcoded localhost address). */
const SITE_URL = String(process.env.SITE_URL || '').trim().replace(/\/+$/, '');

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

/* Contact form email forwarding. Public messages are always saved in the
   database (visible in Admin -> Messages). When SMTP_USER/SMTP_PASS are set,
   each message is ALSO emailed to CONTACT_RECIPIENT (e.g. Gmail + App
   Password). Leave SMTP_USER empty to send no emails at all. */
const SMTP_HOST = String(process.env.SMTP_HOST || 'smtp.gmail.com');
const SMTP_PORT = Number(process.env.SMTP_PORT) || 465;
const SMTP_USER = String(process.env.SMTP_USER || '').trim();
const SMTP_PASS = String(process.env.SMTP_PASS || '').trim();
const CONTACT_FROM = String(process.env.CONTACT_FROM || 'BookHaven <bookhaven@bookhaven.support>').trim();
const CONTACT_RECIPIENT = String(process.env.CONTACT_RECIPIENT || 'Bookhaven41@gmail.com').trim();

/* Social sign-in (OAuth 2.0). Register a free app with each provider and
   put the credentials here (Google Cloud Console, Facebook Developers, Meta
   for Instagram). Any provider left blank is simply hidden from the
   sign-in page. The callback URLs to register per provider are:
     Google:    <SITE_URL>/api/auth/google/callback
     Facebook:  <SITE_URL>/api/auth/facebook/callback
     Instagram: <SITE_URL>/api/auth/instagram/callback
   Signing in with a provider auto-creates an account on first use. */
const GOOGLE_CLIENT_ID = String(process.env.GOOGLE_CLIENT_ID || '').trim();
const GOOGLE_CLIENT_SECRET = String(process.env.GOOGLE_CLIENT_SECRET || '').trim();
const FACEBOOK_APP_ID = String(process.env.FACEBOOK_APP_ID || '').trim();
const FACEBOOK_APP_SECRET = String(process.env.FACEBOOK_APP_SECRET || '').trim();
const INSTAGRAM_CLIENT_ID = String(process.env.INSTAGRAM_CLIENT_ID || '').trim();
const INSTAGRAM_CLIENT_SECRET = String(process.env.INSTAGRAM_CLIENT_SECRET || '').trim();

const TOKEN_TTL_MS = (Number(process.env.SESSION_TTL_DAYS) || 30) * 24 * 60 * 60 * 1000;
const CORS_ORIGIN = process.env.CORS_ORIGIN || '';             // '' = same origin, '*' = any, or an exact origin
const UPLOAD_DIR = path.resolve(process.env.UPLOAD_DIR || path.join(__dirname, 'uploads'));
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

/* ---------- 01. Database setup ----------
   The schema, migrations and seeding live in db.js / supabase/schema.sql;
   server.js only ever calls db.get / db.all / db.run. */
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

/* Insert the seed catalogue inside a single transaction for speed. Runs on
   first boot only, whether the database is SQLite or Supabase. */
const SEED_INSERT_SQL = `
  INSERT INTO books (title, author, category, subcategory, description, cover, price, oldPrice, stock, rating, reviews, featured, bestseller, isNew)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`;

async function seedBooksIfEmpty() {
  const bookCount = Number((await db.get('SELECT COUNT(*) AS n FROM books')).n);
  if (bookCount > 0) return;

  await db.withTransaction(async (t) => {
    for (const [i, b] of SEED_BOOKS.entries()) {
      const m = seedMeta(b, i);
      await t.run(SEED_INSERT_SQL, [
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
      ]);
    }
  });
  console.log(`Seeded database with ${SEED_BOOKS.length} books.`);
}

/* Any legacy rows missing values after a migration get sensible defaults,
   varied per book so genres stay representative. */
async function backfillMissingFields() {
  const rows = await db.all(`
    SELECT id, category, title FROM books
    WHERE TRIM(COALESCE(subcategory, '')) = '' OR stock IS NULL
       OR TRIM(COALESCE(description, '')) = ''
  `);
  const fix = 'UPDATE books SET subcategory = ?, description = ?, stock = ? WHERE id = ?';
  const seen = {};
  for (const r of rows) {
    const subs = SUBGENRE_BY_CAT[r.category] || ['General'];
    const i = seen[r.category] = (seen[r.category] || 0) + 1;
    await db.run(fix, [
      subs[i % subs.length],
      `"${r.title}" — a BookHaven favourite.`,
      r.stock == null ? 5 + ((i * 7) % 41) : r.stock,
      r.id
    ]);
  }
  if (rows.length) console.log(`Backfilled missing fields for ${rows.length} books.`);
}

/* ----- Admin account (seeded once — change via env vars or the users table) ----- */
async function seedAdminIfEmpty() {
  const adminCount = Number((await db.get("SELECT COUNT(*) AS n FROM users WHERE role = 'admin'")).n);
  if (adminCount === 0) {
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = hashPassword(ADMIN_PASSWORD, salt);
    await db.run('INSERT INTO users (name, email, password_hash, salt, role) VALUES (?, ?, ?, ?, ?)',
      [ADMIN_NAME, ADMIN_EMAIL, hash, salt, 'admin']);
    console.log(`Seeded admin account: ${ADMIN_EMAIL}`);
  }
}

function hashPassword(password, salt) {
  return crypto.scryptSync(password, salt, 64).toString('hex');
}

function verifyPassword(password, salt, hash) {
  const test = crypto.scryptSync(password, salt, 64);
  const expected = Buffer.from(hash, 'hex');
  return test.length === expected.length && crypto.timingSafeEqual(test, expected);
}

async function createSession(userId) {
  const token = crypto.randomBytes(32).toString('hex');
  const expires = new Date(Date.now() + TOKEN_TTL_MS).toISOString();
  await db.run('INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)', [token, userId, expires]);
  return token;
}

async function getUserByToken(token) {
  if (!token) return null;
  const row = await db.get(`
    SELECT u.id, u.name, u.email, u.role
    FROM sessions s JOIN users u ON u.id = s.user_id
    WHERE s.token = ? AND s.expires_at > ?
  `, [token, new Date().toISOString()]);
  return row || null;
}

const bearerUser = (req) => getUserByToken(String(req.headers.authorization || '').replace(/^Bearer\s+/i, ''));

async function requireAdmin(req, res, next) {
  try {
    const user = await bearerUser(req);
    if (!user || user.role !== 'admin') return res.status(401).json({ error: 'Unauthorized — admin login required' });
    req.user = user;
    next();
  } catch (err) {
    next(err);
  }
}

/* ____________ 02. Helpers ____________ */
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

/* ____________ 03. App ____________ */
const app = express();
app.set('trust proxy', 1); /* Read the real client IP through Render/Heroku-style proxies */
app.use(express.json({ limit: '8mb' }));

/* Wrap async route handlers so a rejected promise reaches the error
   middleware below instead of crashing the process. */
const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

/* Runtime config injected into every page (loaded before js/api-config.js).
   Controls the site URL shown in error banners on the live site, and tells
   the account page which social sign-in providers are configured. */
app.get('/config.js', (req, res) => {
  res.type('application/javascript');
  res.set('Cache-Control', 'no-store');
  res.send(`window.__BOOKHAVEN_CONFIG__ = ${JSON.stringify({
    SITE_URL: SITE_URL || '',
    API_BASE_URL: '',
    SOCIAL_AUTH: {
      google: GOOGLE_CLIENT_ID ? { redirectUrl: '/api/auth/google' } : null,
      facebook: FACEBOOK_APP_ID ? { redirectUrl: '/api/auth/facebook' } : null,
      instagram: INSTAGRAM_CLIENT_ID ? { redirectUrl: '/api/auth/instagram' } : null
    }
  })};`);
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

/* ____________ Books API ____________ */
app.get('/api/books', ah(async (req, res) => {
  const rows = await db.all('SELECT * FROM books ORDER BY id');
  res.json(rows.map(rowToBook));
}));

app.get('/api/books/:id', ah(async (req, res) => {
  const row = await db.get('SELECT * FROM books WHERE id = ?', [Number(req.params.id)]);
  if (!row) return res.status(404).json({ error: 'Book not found' });
  res.json(rowToBook(row));
}));

/* Categories + subgenres derived from the database (single source of truth) */
app.get('/api/categories', ah(async (req, res) => {
  const rows = await db.all(`
    SELECT category, subcategory FROM books
    WHERE subcategory IS NOT NULL AND TRIM(subcategory) != ''
    GROUP BY category, subcategory ORDER BY category, subcategory
  `);
  const byCat = {};
  for (const r of rows) {
    if (!byCat[r.category]) byCat[r.category] = [];
    byCat[r.category].push(r.subcategory);
  }
  for (const c of await db.all('SELECT DISTINCT category FROM books ORDER BY category')) {
    if (!byCat[c.category]) byCat[c.category] = [];
  }
  res.json(byCat);
}));

app.post('/api/books', requireAdmin, ah(async (req, res) => {
  try {
    const b = parseBookBody(req.body);
    const info = await db.run(SEED_INSERT_SQL, [
      b.title, b.author, b.category, b.subcategory, b.description, b.cover,
      b.price, b.oldPrice, b.stock, b.rating, b.reviews,
      b.featured ? 1 : 0, b.bestseller ? 1 : 0, b.isNew ? 1 : 0
    ]);
    const row = await db.get('SELECT * FROM books WHERE id = ?', [Number(info.lastInsertRowid)]);
    res.status(201).json(rowToBook(row));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}));

app.put('/api/books/:id', requireAdmin, ah(async (req, res) => {
  const id = Number(req.params.id);
  const exists = await db.get('SELECT id FROM books WHERE id = ?', [id]);
  if (!exists) return res.status(404).json({ error: 'Book not found' });
  try {
    const b = parseBookBody(req.body);
    await db.run(`
      UPDATE books SET title = ?, author = ?, category = ?, subcategory = ?, description = ?,
             cover = ?, price = ?, oldPrice = ?, stock = ?, rating = ?, reviews = ?,
             featured = ?, bestseller = ?, isNew = ?
      WHERE id = ?
    `, [
      b.title, b.author, b.category, b.subcategory, b.description, b.cover,
      b.price, b.oldPrice, b.stock, b.rating, b.reviews,
      b.featured ? 1 : 0, b.bestseller ? 1 : 0, b.isNew ? 1 : 0, id
    ]);
    const row = await db.get('SELECT * FROM books WHERE id = ?', [id]);
    res.json(rowToBook(row));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}));

app.delete('/api/books/:id', requireAdmin, ah(async (req, res) => {
  const info = await db.run('DELETE FROM books WHERE id = ?', [Number(req.params.id)]);
  if (info.changes === 0) return res.status(404).json({ error: 'Book not found' });
  res.json({ ok: true });
}));

/* ____________ Cover image upload (admin). Accepts a base64 data URL, stores the
   file on the server and returns the public /uploads URL to save in the DB. ____________ */
const IMAGE_RE = /^data:image\/(png|jpe?g|gif|webp);base64,/;
const IMAGE_EXTS = { png: '.png', jpeg: '.jpg', jpg: '.jpg', gif: '.gif', webp: '.webp' };
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

app.post('/api/upload', requireAdmin, ah(async (req, res) => {
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
}));

/* ____________ Orders API ____________
   Creation is public (the shopper). Listing is admin-only. The database is
   the source of truth; the frontend keeps a localStorage mirror so the
   admin panel still shows recent orders when the API is unreachable. */
app.post('/api/orders', ah(async (req, res) => {
  const { customer, email, items, total } = req.body || {};
  if (!customer || !String(customer).trim()) return res.status(400).json({ error: 'Customer name is required' });
  if (!/^\S+@\S+\.\S+$/.test(String(email || ''))) return res.status(400).json({ error: 'A valid email is required' });
  const qty = Number(items);
  const amount = Number(total);
  if (!Number.isInteger(qty) || qty < 1) return res.status(400).json({ error: 'The number of items is required' });
  if (!(amount >= 0) || isNaN(amount)) return res.status(400).json({ error: 'A valid order total is required' });

  const max = await db.get('SELECT MAX(id) AS m FROM orders');
  const ref = 'BH-' + (1046 + ((max.m || 0) + 1));
  const info = await db.run(`
    INSERT INTO orders (order_ref, customer, email, date, items, total) VALUES (?, ?, ?, ?, ?, ?)
  `, [ref, String(customer).trim(), String(email).trim().toLowerCase(), new Date().toISOString().slice(0, 10), qty, Math.round(amount * 100) / 100]);
  const row = await db.get('SELECT * FROM orders WHERE id = ?', [Number(info.lastInsertRowid)]);
  res.status(201).json(row);
}));

/* Public order lookup for the Track Your Order page. Requires BOTH the
   order reference and the email used at checkout, so orders cannot be
   enumerated by guessing references alone. */
app.get('/api/orders/lookup', ah(async (req, res) => {
  const ref = String(req.query.ref || '').trim().toUpperCase();
  const email = String(req.query.email || '').trim().toLowerCase();
  if (!/^BH-\d+$/.test(ref)) return res.status(400).json({ error: 'Enter an order reference like BH-1047.' });
  if (!/^\S+@\S+\.\S+$/.test(email)) return res.status(400).json({ error: 'Enter the email you used at checkout.' });
  const row = await db.get(
    'SELECT order_ref, customer, date, items, total, status FROM orders WHERE UPPER(order_ref) = ? AND email = ?',
    [ref, email]
  );
  if (!row) return res.status(404).json({ error: 'No order matches that reference and email. Double-check both and try again.' });
  res.json(row);
}));

app.get('/api/orders', requireAdmin, ah(async (req, res) => {
  res.json(await db.all('SELECT * FROM orders ORDER BY id DESC'));
}));

/* ____________ Contact messages API ____________
   Creation is public (the visitor's "Send Message" form). Every message is
   saved to the database (shown in Admin -> Messages) and — when SMTP is
   configured — also forwarded to CONTACT_RECIPIENT by email. Listing and
   deletion are admin-only. */
app.post('/api/contact', ah(async (req, res) => {
  const { name, email, subject, message } = req.body || {};
  const cleanName = String(name || '').trim();
  const cleanEmail = String(email || '').trim().toLowerCase();
  const cleanSubject = String(subject || '').trim();
  const cleanMessage = String(message || '').trim();

  if (!cleanName) return res.status(400).json({ error: 'Your name is required' });
  if (!/^\S+@\S+\.\S+$/.test(cleanEmail)) return res.status(400).json({ error: 'A valid email is required' });
  if (cleanMessage.length < 10) return res.status(400).json({ error: 'Your message is a little short — a few more words helps us help you.' });

  const info = await db.run(`
    INSERT INTO contact_messages (name, email, subject, message) VALUES (?, ?, ?, ?)
  `, [cleanName, cleanEmail, cleanSubject, cleanMessage]);
  const row = await db.get('SELECT * FROM contact_messages WHERE id = ?', [Number(info.lastInsertRowid)]);

  /* Email forwarding — best effort: never fail the request over a mail error
     (the message is already safely stored in the database). */
  if (SMTP_USER && SMTP_PASS) {
    try {
      const transporter = nodemailer.createTransport({
        host: SMTP_HOST,
        port: SMTP_PORT,
        secure: SMTP_PORT === 465,
        auth: { user: SMTP_USER, pass: SMTP_PASS }
      });
      await transporter.sendMail({
        from: CONTACT_FROM,
        to: CONTACT_RECIPIENT,
        replyTo: `"${cleanName.replace(/"/g, "'")}" <${cleanEmail}>`,
        subject: `[BookHaven] ${cleanSubject || 'Website message'} — from ${cleanName}`,
        text: `New message from the BookHaven contact form.\n\nName: ${cleanName}\nEmail: ${cleanEmail}\nSubject: ${cleanSubject || '(none)'}\n\n${cleanMessage}`
      });
    } catch (err) {
      console.error('Failed to email contact message:', err.message);
    }
  }

  res.status(201).json(row);
}));

app.get('/api/contact', requireAdmin, ah(async (req, res) => {
  res.json(await db.all('SELECT * FROM contact_messages ORDER BY id DESC'));
}));

app.delete('/api/contact/:id', requireAdmin, ah(async (req, res) => {
  const info = await db.run('DELETE FROM contact_messages WHERE id = ?', [Number(req.params.id)]);
  if (info.changes === 0) return res.status(404).json({ error: 'Message not found' });
  res.json({ ok: true });
}));

/* ____________ Auth API ____________ */
app.post('/api/auth/register', ah(async (req, res) => {
  const { name, email, password } = req.body || {};
  if (!name || !String(name).trim()) return res.status(400).json({ error: 'Name is required' });
  if (!/^\S+@\S+\.\S+$/.test(email || '')) return res.status(400).json({ error: 'A valid email is required' });
  if (!password || String(password).length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });

  const exists = await db.get('SELECT id FROM users WHERE email = ?', [String(email).trim().toLowerCase()]);
  if (exists) return res.status(409).json({ error: 'An account with this email already exists' });

  const salt = crypto.randomBytes(16).toString('hex');
  const hash = hashPassword(password, salt);
  const info = await db.run('INSERT INTO users (name, email, password_hash, salt, role) VALUES (?, ?, ?, ?, ?)',
    [String(name).trim(), String(email).trim().toLowerCase(), hash, salt, 'customer']);

  const token = await createSession(Number(info.lastInsertRowid));
  res.status(201).json({
    token,
    user: { id: Number(info.lastInsertRowid), name: String(name).trim(), email: String(email).trim().toLowerCase(), role: 'customer' }
  });
}));

app.post('/api/auth/login', loginLimiter, ah(async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'Email and password are required' });

  const row = await db.get('SELECT * FROM users WHERE email = ?', [String(email).trim().toLowerCase()]);
  if (!row || !verifyPassword(String(password), row.salt, row.password_hash)) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }

  const token = await createSession(row.id);
  res.json({ token, user: { id: row.id, name: row.name, email: row.email, role: row.role } });
}));

app.post('/api/auth/logout', ah(async (req, res) => {
  const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (token) await db.run('DELETE FROM sessions WHERE token = ?', [token]);
  res.json({ ok: true });
}));

app.get('/api/auth/me', ah(async (req, res) => {
  const user = await bearerUser(req);
  if (!user) return res.status(401).json({ error: 'Not signed in' });
  res.json({ user });
}));

/* ____________ Social sign-in (OAuth 2.0 redirect flow) ____________
   Every provider follows the same pattern:
     1. GET /api/auth/<provider>          -> redirect the browser to the provider
     2. GET /api/auth/<provider>/callback <- provider redirects back with a code
   The backend exchanges the code for an access token, fetches the profile,
   creates or links a customer account, then redirects to
   /account.html?token=<session> so the storefront can log them in. */

function getSiteUrl() {
  return SITE_URL || `http://localhost:${PORT}`;
}

/* Create a session from a verified social profile (find-or-create user).
   providerId and email tie Google/Facebook/Instagram identities to a row. */
async function socialSession(profile) {
  const providerId = String(profile.providerId);
  const email = String(profile.email || '').trim().toLowerCase();

  let row = await db.get('SELECT * FROM users WHERE provider = ? AND provider_id = ?',
    [profile.provider, providerId]);
  if (!row && email) {
    row = await db.get('SELECT * FROM users WHERE email = ?', [email]);
  }

  if (row) {
    if (row.provider !== profile.provider) {
      await db.run('UPDATE users SET provider = ?, provider_id = ? WHERE id = ?',
        [profile.provider, providerId, row.id]);
    }
  } else {
    const salt = crypto.randomBytes(16).toString('hex');
    /* Social-only accounts get an unusable stored password (still hashed so
       the schema stays consistent) and sign in via their provider instead. */
    const dummyHash = hashPassword(crypto.randomBytes(24).toString('hex'), salt);
    const info = await db.run(`
      INSERT INTO users (name, email, password_hash, salt, role, provider, provider_id)
      VALUES (?, ?, ?, ?, 'customer', ?, ?)
    `, [
      String(profile.name || profile.provider).trim().slice(0, 200),
      email || `${profile.provider}_${providerId}@bookhaven.local`,
      dummyHash, salt, profile.provider, providerId
    ]);
    row = await db.get('SELECT * FROM users WHERE id = ?', [Number(info.lastInsertRowid)]);
  }

  if (!row) return null;
  return { token: await createSession(row.id), user: { id: row.id, name: row.name, email: row.email, role: row.role } };
}

function redirectAfterAuth(res, auth) {
  if (!auth) return res.redirect('/account.html?error=signin_failed');
  res.redirect(`/account.html?token=${encodeURIComponent(auth.token)}`);
}

/* ---- Google ---- */
app.get('/api/auth/google', (req, res) => {
  if (!GOOGLE_CLIENT_ID) return res.redirect('/account.html?error=not_configured');
  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: getSiteUrl() + '/api/auth/google/callback',
    response_type: 'code',
    scope: 'openid email profile',
    access_type: 'online',
    prompt: 'select_account'
  });
  res.redirect('https://accounts.google.com/o/oauth2/v2/auth?' + params.toString());
});

app.get('/api/auth/google/callback', ah(async (req, res) => {
  const { code, error } = req.query;
  if (error || !code) return redirectAfterAuth(res, null);
  try {
    const tok = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code: String(code),
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        redirect_uri: getSiteUrl() + '/api/auth/google/callback',
        grant_type: 'authorization_code'
      })
    }).then((r) => r.json());
    if (!tok.access_token) return redirectAfterAuth(res, null);
    const info = await fetch('https://www.googleapis.com/oauth2/v1/userinfo?access_token=' + encodeURIComponent(tok.access_token))
      .then((r) => r.json());
    if (!info || !info.id || !info.email) return redirectAfterAuth(res, null);
    redirectAfterAuth(res, await socialSession({
      name: info.name, email: info.email, provider: 'google', providerId: info.id
    }));
  } catch (err) {
    console.error('Google OAuth error:', err.message);
    redirectAfterAuth(res, null);
  }
}));

/* ---- Facebook ---- */
app.get('/api/auth/facebook', (req, res) => {
  if (!FACEBOOK_APP_ID) return res.redirect('/account.html?error=not_configured');
  const params = new URLSearchParams({
    client_id: FACEBOOK_APP_ID,
    redirect_uri: getSiteUrl() + '/api/auth/facebook/callback',
    state: 'bh_' + crypto.randomBytes(8).toString('hex'),
    scope: 'email'
  });
  res.redirect('https://www.facebook.com/v19.0/dialog/oauth?' + params.toString());
});

app.get('/api/auth/facebook/callback', ah(async (req, res) => {
  const { code, error } = req.query;
  if (error || !code) return redirectAfterAuth(res, null);
  try {
    const q = new URLSearchParams({
      client_id: FACEBOOK_APP_ID,
      client_secret: FACEBOOK_APP_SECRET,
      redirect_uri: getSiteUrl() + '/api/auth/facebook/callback',
      code: String(code)
    });
    const tok = await fetch('https://graph.facebook.com/v19.0/oauth/access_token?' + q.toString())
      .then((r) => r.json());
    if (!tok.access_token) return redirectAfterAuth(res, null);
    const me = await fetch('https://graph.facebook.com/v19.0/me?fields=id,name,email&access_token=' + encodeURIComponent(tok.access_token))
      .then((r) => r.json());
    if (!me || !me.id) return redirectAfterAuth(res, null);
    redirectAfterAuth(res, await socialSession({
      name: me.name, email: me.email || '', provider: 'facebook', providerId: me.id
    }));
  } catch (err) {
    console.error('Facebook OAuth error:', err.message);
    redirectAfterAuth(res, null);
  }
}));

/* ---- Instagram (Meta Graph API — "Instagram Login with Instagram") ----
   NOTE: Instagram does not hand out email addresses, so first-time users get
   an account named after their handle with a placeholder email. To use this
   you need a Meta Developer app with the "Instagram API with Instagram Login
   with Instagram" product, an Instagram Business/Creator account linked to a
   Meta business portfolio, and (for other apps) App Review approval. */
app.get('/api/auth/instagram', (req, res) => {
  if (!INSTAGRAM_CLIENT_ID) return res.redirect('/account.html?error=not_configured');
  const params = new URLSearchParams({
    client_id: INSTAGRAM_CLIENT_ID,
    redirect_uri: getSiteUrl() + '/api/auth/instagram/callback',
    response_type: 'code',
    scope: 'user_profile'
  });
  res.redirect('https://api.instagram.com/oauth/authorize?' + params.toString());
});

app.get('/api/auth/instagram/callback', ah(async (req, res) => {
  const { code, error } = req.query;
  if (error || !code) return redirectAfterAuth(res, null);
  try {
    const tok = await fetch('https://api.instagram.com/oauth/access_token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: INSTAGRAM_CLIENT_ID,
        client_secret: INSTAGRAM_CLIENT_SECRET,
        grant_type: 'authorization_code',
        redirect_uri: getSiteUrl() + '/api/auth/instagram/callback',
        code: String(code)
      })
    }).then((r) => r.json());
    if (!tok.access_token) return redirectAfterAuth(res, null);
    const me = await fetch('https://graph.instagram.com/me?fields=id,username&access_token=' + encodeURIComponent(tok.access_token))
      .then((r) => r.json());
    if (!me || !me.id) return redirectAfterAuth(res, null);
    redirectAfterAuth(res, await socialSession({
      name: me.username || 'Instagram user',
      email: '',
      provider: 'instagram',
      providerId: me.id
    }));
  } catch (err) {
    console.error('Instagram OAuth error:', err.message);
    redirectAfterAuth(res, null);
  }
}));

/* ____________ Fallback + error handling ____________ */
app.use((err, req, res, next) => {
  console.error('Request failed:', err.message);
  if (res.headersSent) return next(err);
  res.status(500).json({ error: 'Server error', detail: err.message });
});

app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

/* ____________ Boot ____________ */
async function start() {
  await db.ping();
  console.log(`Database: ${db.isPostgres ? 'Supabase (PostgreSQL)' : 'local SQLite'}`);
  await seedBooksIfEmpty();
  await backfillMissingFields();
  await seedAdminIfEmpty();
  app.listen(PORT, () => {
    console.log(`BookHaven running at http://localhost:${PORT}`);
    console.log(`Books API: http://localhost:${PORT}/api/books`);
    console.log(`Uploads served from: ${UPLOAD_DIR}`);
  });
}

start().catch((err) => {
  console.error('Failed to start BookHaven:', err.message);
  process.exit(1);
});