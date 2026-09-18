/* ==========================================================================
   BookHaven — Admin Panel
   Dashboard, book management and order overview.
   All book data lives in the SQLite database and is reached through the
   backend API (GET/POST/PUT/DELETE /api/books). localStorage is only used
   as a read cache so the storefront can still display the last saved data
   while the server is unreachable — never as the source of truth.
   ========================================================================== */
'use strict';

const $  = (sel, ctx = document) => ctx.querySelector(sel);
const $$ = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));

const CATEGORIES = ["Fiction", "Science", "Business", "Technology", "Romance", "Children's", "History", "Young Adult", "Self-Help", "Biography", "Cook Books & Wine"];

/* ---------- 01. Persistence (SQLite via API, localStorage read cache) ---------- */
const STORE_KEY = 'bookhaven.books';

/* The database is the single source of truth; localStorage is only a cache
   mirror so the storefront keeps showing the last known data offline. */
const persistLocal = () => {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(books)); } catch (e) { /* ignore */ }
};

/* Network-level failure (server down / file://) vs. a real server error */
const isOffline = (err) =>
  err instanceof TypeError ||
  /failed to fetch|networkerror|load failed/i.test(String((err && err.message) || err));

function loadBooksFromStorage() {
  let list = null;
  try {
    const raw = localStorage.getItem(STORE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    if (Array.isArray(parsed) && parsed.length) list = parsed;
  } catch (e) { /* ignore */ }
  return list || [];
}

let books = [];

async function loadBooks() {
  try {
    const res = await fetch(API_BASE + '/api/books');
    if (!res.ok) throw new Error('API unavailable');
    const data = await res.json();
    if (Array.isArray(data)) { books = data; persistLocal(); return; }
  } catch (e) { /* fall back to cache below */ }
  books = loadBooksFromStorage();
  if (!books.length) books = await loadStaticBooks();
  persistLocal();
  if (!books.length) toast('Server unreachable — no saved book data found');
}

/* Subcategories come from the database (categories + genres are DB-managed) */
let subcategoriesByCat = {};

async function loadCategories() {
  try {
    const res = await fetch(API_BASE + '/api/categories');
    if (!res.ok) return;
    subcategoriesByCat = await res.json();
    populateGenreOptions($('#f-category').value);
  } catch (e) { /* keep UI fallback (none listed) */ }
}

/* Escape user-supplied text so it is safe to inject into <option> tags */
function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

/* Genre <select>: the options are the subgenres stored for the currently
   selected category (e.g. Fantasy, Thriller under Fiction), plus a
   "new genre" entry so brand-new genres can be typed in. */
const genreSelect = $('#f-subcategory');
const newGenreBtn = $('#new-genre-btn');
const newGenreField = $('#new-genre-field');
const newGenreInput = $('#f-new-genre');

function subgenresFor(cat) {
  return Array.isArray(subcategoriesByCat[cat]) ? subcategoriesByCat[cat].filter(Boolean) : [];
}

function hideNewGenre() {
  if (newGenreField) newGenreField.hidden = true;
  if (newGenreInput) newGenreInput.value = '';
}

function populateGenreOptions(cat, current = '') {
  if (!genreSelect) return;
  const names = subgenresFor(cat);
  const known = new Set(names.map((s) => s.trim().toLowerCase()));
  const cur = String(current || '').trim();

  let opts = '<option value="">— none —</option>';
  names.forEach((s) => {
    opts += `<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`;
  });
  if (cur && !known.has(cur.toLowerCase())) {
    opts += `<option value="${escapeHtml(cur)}">${escapeHtml(cur)}</option>`;
  }
  opts += '<option value="__custom__">+ New genre…</option>';

  genreSelect.innerHTML = opts;
  genreSelect.value = cur ? cur : '';
  hideNewGenre();
}

if (newGenreBtn) {
  newGenreBtn.addEventListener('click', (e) => {
    e.preventDefault();
    genreSelect.value = '__custom__';
    if (newGenreField) newGenreField.hidden = false;
    if (newGenreInput) setTimeout(() => newGenreInput.focus(), 30);
  });
}

if (genreSelect) {
  genreSelect.addEventListener('change', () => {
    if (genreSelect.value === '__custom__') {
      if (newGenreField) newGenreField.hidden = false;
      if (newGenreInput) setTimeout(() => newGenreInput.focus(), 30);
    } else {
      hideNewGenre();
    }
  });
}

const categoryField = $('#f-category');
if (categoryField) {
  categoryField.addEventListener('change', () => {
    hideNewGenre();
    const book = books.find((b) => b.id === editingId);
    populateGenreOptions(categoryField.value, book ? book.subcategory : '');
  });
}

async function apiRequest(method, url, body) {
  const token = (() => { try { return localStorage.getItem('bookhaven.auth') || ''; } catch (e) { return ''; } })();
  const res = await fetch(API_BASE + url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: 'Bearer ' + token } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  });
  if (!res.ok) {
    let msg = 'Request failed';
    const ct = res.headers.get('content-type') || '';
    if (!ct.includes('application/json')) {
      msg = 'Backend not found at this address (HTTP ' + res.status + '). ' + (BOOKHAVEN_SITE_HINT ? 'Open the site at ' + BOOKHAVEN_SITE_HINT + '.' : 'Open the site from the server that hosts it.');
    } else {
      try { msg = (await res.json()).error || msg; } catch (e) { /* ignore */ }
    }
    const err = new Error(msg);
    if (res.status === 401) err.code = 401;
    throw err;
  }
  return res.json();
}

const apiPost   = (body) => apiRequest('POST', '/api/books', body);
const apiPut    = (id, body) => apiRequest('PUT', '/api/books/' + id, body);
const apiDelete = (id) => apiRequest('DELETE', '/api/books/' + id);
const apiUpload = (data) => apiRequest('POST', '/api/upload', { data });

const fmt = (n) => fmtPrice(n);
const fmtReviews = (n) => (n >= 1000 ? (n / 1000).toFixed(1) + 'k' : n);

/* ---------- 02. Tabs ---------- */
const TITLES = { dashboard: 'Dashboard', books: 'Books', orders: 'Orders', messages: 'Messages' };

function switchTab(name) {
  $$('.admin-nav-item').forEach((btn) => {
    const active = btn.dataset.tab === name;
    btn.classList.toggle('active', active);
    if (active) btn.setAttribute('aria-current', 'page');
    else btn.removeAttribute('aria-current');
  });
  $$('.admin-panel').forEach((panel) =>
    panel.classList.toggle('active', panel.id === 'panel-' + name));
  const title = $('#admin-title');
  if (title) title.textContent = TITLES[name] || 'Dashboard';
}

$$('.admin-nav-item').forEach((btn) =>
  btn.addEventListener('click', () => switchTab(btn.dataset.tab)));

/* ---------- 03. Dashboard ---------- */
function renderDashboard() {
  const featured = books.filter((b) => b.featured).length;
  const best = books.filter((b) => b.bestseller).length;
  const deals = books.filter((b) => b.oldPrice).length;
  const fresh = books.filter((b) => b.isNew).length;
  const liveCats = new Set(books.map((b) => b.category));
  const cats = liveCats.size ? liveCats.size : CATEGORIES.length;

  $('#stat-grid').innerHTML = [
    ['Total Books', books.length],
    ['Categories', cats],
    ['Featured', featured],
    ['Best Sellers', best],
    ['On Sale', deals],
    ['New Releases', fresh]
  ].map(([label, value]) => `
    <div class="stat-card">
      <div class="stat-value">${value}</div>
      <div class="stat-label">${label}</div>
    </div>`).join('');

  // Books per category
  const catNames = liveCats.size ? [...liveCats] : CATEGORIES;
  const max = Math.max(1, ...catNames.map((c) => books.filter((b) => b.category === c).length));
  $('#category-bars').innerHTML = catNames.map((cat) => {
    const count = books.filter((b) => b.category === cat).length;
    return `
    <div class="cat-bar-row">
      <div class="cat-bar-head"><span>${cat}</span><span>${count}</span></div>
      <div class="cat-bar"><i style="width:${(count / max) * 100}%"></i></div>
    </div>`;
  }).join('');

  // Recently added (highest ids = newest)
  const recent = [...books].sort((a, b) => b.id - a.id).slice(0, 5);
  $('#recent-books').innerHTML = recent.map((b) => `
    <li class="recent-item">
      <img src="${b.cover}" alt="" loading="lazy">
      <div><strong>${b.title}</strong><span>${b.author} · ${b.category}</span></div>
      <span class="price">${fmt(b.price)}</span>
    </li>`).join('');
}

/* ---------- 04. Books table ---------- */
const FLAG_META = [
  ['F', 'featured'],
  ['B', 'bestseller'],
  ['N', 'isNew']
];

/* The catalog now holds thousands of books, so the table renders in pages
   (60 rows at a time) with a "Show more" button to keep the DOM light. */
const ADMIN_PAGE_SIZE = 60;
let adminFiltered = [];
let adminShown = 0;

function rowCoverFallback(img) {
  if (!img) return;
  img.onerror = null;
  img.style.objectFit = 'cover';
  img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="150" viewBox="0 0 100 150">' +
    '<rect width="100" height="150" rx="6" fill="#1d1d24"/>' +
    '<rect x="6" y="6" width="88" height="138" rx="4" fill="none" stroke="#c9a227" stroke-opacity=".4"/>' +
    '<rect x="40" y="26" width="20" height="3" fill="#c9a227"/>' +
    '<text x="50" y="60" font-family="Georgia,serif" font-size="11" font-weight="bold" fill="#f6f1e4" text-anchor="middle">B</text>' +
    '<text x="50" y="76" font-family="Georgia,serif" font-size="11" font-weight="bold" fill="#f6f1e4" text-anchor="middle">H</text>' +
    '<text x="50" y="118" font-family="Arial,sans-serif" font-size="7" fill="#9a978e" text-anchor="middle">BOOKHAVEN</text></svg>');
}

function bookRow(b) {
  return `
    <tr data-id="${b.id}">
      <td>
        <div class="book-cell">
<img src="${b.cover}" alt="" loading="lazy" onerror="rowCoverFallback(this)">
          <div><strong>${b.title}</strong><span>${b.author}</span></div>
        </div>
      </td>
      <td>${b.category}${b.subcategory ? `<br><span style="font-size:11px;color:var(--muted)">${b.subcategory}</span>` : ''}</td>
      <td><span class="cell-price">${fmt(b.price)}</span>${b.oldPrice ? `<span class="cell-old">${fmt(b.oldPrice)}</span>` : ''}</td>
      <td>${b.rating} <span style="color:var(--muted);font-size:12px">(${fmtReviews(b.reviews)})</span></td>
      <td><span class="stock-chip ${b.stock > 0 ? 'on' : 'off'}">${b.stock > 0 ? b.stock + ' in stock' : 'Out of stock'}</span></td>
      <td>${FLAG_META.map(([label, key]) =>
        `<span class="flag-chip-mini ${b[key] ? 'on' : 'off'}">${label}</span>`).join('')}</td>
      <td class="col-actions">
        <div class="row-actions">
          <button class="icon-btn edit" data-edit="${b.id}" title="Edit book" aria-label="Edit ${b.title}">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L20 8l-4-4L4 16v4zM13.5 6.5l4 4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </button>
          <button class="icon-btn del" data-del="${b.id}" title="Delete book" aria-label="Delete ${b.title}">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M6.5 7l1 13h9l1-13" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </button>
        </div>
      </td>
    </tr>`;
}

function renderBooks(query = '') {
  const q = query.trim().toLowerCase();
  adminFiltered = books.filter((b) =>
    !q || b.title.toLowerCase().includes(q) || b.author.toLowerCase().includes(q) ||
    b.category.toLowerCase().includes(q));
  adminShown = 0;

  const count = $('#book-count');
  if (count) count.textContent = `${adminFiltered.length} of ${books.length} books`;

  addAdminRows();
  updateAdminMore();
}

function addAdminRows() {
  const tbody = $('#books-tbody');
  if (!tbody) return;
  const chunk = adminFiltered.slice(adminShown, adminShown + ADMIN_PAGE_SIZE);
  if (!chunk.length && adminShown === 0) {
    tbody.innerHTML = '<tr><td colspan="7" class="no-results">No books found.</td></tr>';
  } else {
    tbody.insertAdjacentHTML('beforeend', chunk.map(bookRow).join(''));
  }
  adminShown += chunk.length;
}

function updateAdminMore() {
  const remaining = adminFiltered.length - adminShown;
  let wrap = $('#admin-more-wrap');
  const tableWrap = document.querySelector('#panel-books .table-wrap');

  if (remaining <= 0) {
    if (wrap) wrap.remove();
    return;
  }
  if (!wrap && tableWrap) {
    wrap = document.createElement('div');
    wrap.id = 'admin-more-wrap';
    wrap.className = 'load-more-wrap';
    tableWrap.appendChild(wrap);
  }
  if (wrap) {
    wrap.innerHTML = `<button type="button" class="btn btn-ghost load-more-btn" data-admin-more>Show more (${remaining} more)</button>`;
  }
}

/* ---------- 05. Book modal (add / edit) ---------- */
const modal = $('#book-modal');
const form = $('#book-form');
let editingId = null;

function openModal(book = null) {
  editingId = book ? book.id : null;
  $('#modal-title').textContent = book ? 'Edit Book' : 'Add Book';

  $('#f-id').value = book ? book.id : '';
  $('#f-title').value = book ? book.title : '';
  $('#f-author').value = book ? book.author : '';
  $('#f-category').value = book ? book.category : 'Fiction';
  populateGenreOptions($('#f-category').value, book ? book.subcategory : '');
  $('#f-description').value = book && book.description ? book.description : '';
  $('#f-cover').value = book ? book.cover : '';
  setCoverPreview(book ? book.cover : '');
  $('#f-price').value = book ? groupPriceInput(String(book.price)) : '';
  $('#f-old').value = book && book.oldPrice ? groupPriceInput(String(book.oldPrice)) : '';
  $('#f-stock').value = book && book.stock != null ? book.stock : 20;
  $('#f-rating').value = book ? book.rating : '';
  $('#f-reviews').value = book ? book.reviews : '';
  $('#f-featured').checked = book ? !!book.featured : false;
  $('#f-bestseller').checked = book ? !!book.bestseller : false;
  $('#f-new').checked = book ? !!book.isNew : false;

  const msg = $('#form-msg');
  if (msg) msg.textContent = '';
  modal.hidden = false;
  setTimeout(() => $('#f-title').focus(), 60);
}

function closeModal() {
  modal.hidden = true;
  editingId = null;
}

function setCoverPreview(url) {
  const preview = $('#cover-preview');
  const box = $('#cover-preview-box');
  if (!preview || !box) return;
  if (url && /^(https?:)?\//i.test(url) || url && url.startsWith('data:')) {
    preview.src = (url.startsWith('http') || url.startsWith('data:')) ? url : API_BASE + url;
    box.hidden = false;
  } else {
    box.hidden = true;
    preview.removeAttribute('src');
  }
}

/* Cover upload: read the picked file as base64, store on the server via the
   API (POST /api/upload) and put the returned URL into the cover field. */
const coverFile = $('#cover-file');
if (coverFile) {
  coverFile.addEventListener('change', async () => {
    const file = coverFile.files && coverFile.files[0];
    const msg = $('#form-msg');
    if (!file) return;
    if (!/^image\/(png|jpe?g|gif|webp)$/i.test(file.type)) {
      if (msg) { msg.textContent = 'Please choose a PNG, JPG, GIF or WEBP image.'; msg.className = 'form-msg err'; }
      coverFile.value = '';
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      if (msg) { msg.textContent = 'Image must be 5 MB or less.'; msg.className = 'form-msg err'; }
      coverFile.value = '';
      return;
    }
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const { url } = await apiUpload(reader.result);
        /* Store the origin-relative path (e.g. /uploads/…): it resolves
           correctly no matter which host the site is served from. */
        $('#f-cover').value = url;
        setCoverPreview(url);
        if (msg) { msg.textContent = 'Image uploaded — save the book to apply it.'; msg.className = 'form-msg ok'; }
      } catch (err) {
        if (msg) { msg.textContent = err.message; msg.className = 'form-msg err'; }
      } finally {
        coverFile.value = '';
      }
    };
    reader.onerror = () => {
      if (msg) { msg.textContent = 'Could not read that image file.'; msg.className = 'form-msg err'; }
      coverFile.value = '';
    };
    reader.readAsDataURL(file);
  });
}

/* Live thousands-separator formatting while typing prices */
['f-price', 'f-old'].forEach((id) => {
  const el = $('#' + id);
  if (!el) return;
  el.addEventListener('input', () => {
    const caret = el.selectionStart ?? el.value.length;
    const formatted = groupPriceInput(el.value);
    const added = formatted.length - el.value.length;
    if (formatted !== el.value) {
      el.value = formatted;
      const pos = Math.min(caret + added, formatted.length);
      el.setSelectionRange(pos, pos);
    }
  });
});

$('#add-book-btn').addEventListener('click', () => openModal());
$('#modal-close').addEventListener('click', closeModal);
$('#modal-cancel').addEventListener('click', closeModal);
modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const msg = $('#form-msg');
  const submitBtn = form.querySelector('button[type="submit"]');

  const title = $('#f-title').value.trim();
  const author = $('#f-author').value.trim();
  const price = parseFloat(stripPriceGrouping($('#f-price').value));
  const oldRaw = stripPriceGrouping($('#f-old').value.trim());
  const stockRaw = $('#f-stock').value.trim();

  if (!title || !author || isNaN(price) || price < 0) {
    msg.textContent = 'Title, author and a valid price are required.';
    msg.className = 'form-msg err';
    return;
  }

  const oldPrice = oldRaw ? Math.max(0, parseFloat(oldRaw)) : null;
  const stock = stockRaw === '' ? 20 : Math.max(0, Math.round(parseFloat(stockRaw) || 0));

  /* Genre comes from the category-aware list — or the "new genre" box. */
  let subcategory = genreSelect ? genreSelect.value : '';
  if (subcategory === '__custom__') {
    subcategory = (newGenreInput ? newGenreInput.value : '').trim();
    if (!subcategory) {
      msg.textContent = 'Type a name for the new genre, or pick one from the list.';
      msg.className = 'form-msg err';
      return;
    }
  }

  const data = {
    title,
    author,
    category: $('#f-category').value,
    subcategory,
    description: $('#f-description').value.trim(),
    cover: $('#f-cover').value.trim() || 'assets/covers/' + title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|$/g, '') + '.jpg',
    price,
    oldPrice,
    stock,
    rating: Math.min(5, Math.max(0, parseFloat($('#f-rating').value) || 0)),
    reviews: Math.max(0, parseInt($('#f-reviews').value, 10) || 0),
    featured: $('#f-featured').checked,
    bestseller: $('#f-bestseller').checked,
    isNew: $('#f-new').checked
  };

  submitBtn.disabled = true;
  try {
    if (editingId) {
      try {
        await apiPut(editingId, data);
      } catch (err) {
        if (!isOffline(err)) throw err;
        Object.assign(books.find((b) => b.id === editingId) || {}, data);
        persistLocal();
      }
      toast('Book updated');
    } else {
      try {
        await apiPost(data);
      } catch (err) {
        if (!isOffline(err)) throw err;
        books.push({ ...data, id: Math.max(0, ...books.map((b) => b.id)) + 1 });
        persistLocal();
      }
      toast('Book added');
    }
    await loadBooks();
    closeModal();
    renderBooks($('#book-search').value);
    renderDashboard();
    switchTab('books');
  } catch (err) {
    if (err.code === 401) {
      msg.textContent = 'Your session expired. Please sign in again.';
      msg.className = 'form-msg err';
      setTimeout(() => { window.location.href = 'account.html?next=admin'; }, 1200);
    } else {
      msg.textContent = err.message;
      msg.className = 'form-msg err';
    }
  } finally {
    submitBtn.disabled = false;
  }
});

/* Table actions (edit / delete) and "Show more" — delegated */
document.addEventListener('click', (e) => {
  const more = e.target.closest('[data-admin-more]');
  if (more) {
    addAdminRows();
    updateAdminMore();
    return;
  }
});

$('#books-tbody').addEventListener('click', async (e) => {
  const editBtn = e.target.closest('[data-edit]');
  if (editBtn) {
    const book = books.find((b) => b.id === Number(editBtn.dataset.edit));
    if (book) openModal(book);
    return;
  }

  const delBtn = e.target.closest('[data-del]');
  if (delBtn) {
    const book = books.find((b) => b.id === Number(delBtn.dataset.del));
    if (!book) return;
    if (confirm(`Delete "${book.title}"? This cannot be undone.`)) {
      try {
        try {
          await apiDelete(book.id);
        } catch (err) {
          if (!isOffline(err)) throw err;
          books = books.filter((b) => b.id !== Number(book.id));
          persistLocal();
        }
        await loadBooks();
        renderBooks($('#book-search').value);
        renderDashboard();
        toast('Book deleted');
      } catch (err) {
        toast(err.message);
      }
    }
  }
});

/* Book search */
const bookSearch = $('#book-search');
bookSearch.addEventListener('input', () => renderBooks(bookSearch.value));

/* ---------- 06. Orders (server-backed, localStorage + sample fallback) ---------- */
const ORDERS_KEY = 'bookhaven.orders';

const SAMPLE_ORDERS = [
  { id: 'BH-1046', customer: 'Amara Okafor', email: 'amara@example.com', date: '2026-08-06', items: 3, total: 54.47, status: 'Processing' },
  { id: 'BH-1045', customer: 'Jonas Meyer', email: 'jonas@example.com', date: '2026-08-05', items: 1, total: 11.99, status: 'Shipped' },
  { id: 'BH-1044', customer: 'Lina Park', email: 'lina@example.com', date: '2026-08-04', items: 2, total: 31.98, status: 'Shipped' },
  { id: 'BH-1043', customer: 'Kwame Mensah', email: 'kwame@example.com', date: '2026-08-03', items: 4, total: 68.45, status: 'Delivered' },
  { id: 'BH-1042', customer: 'Sofia Ricci', email: 'sofia@example.com', date: '2026-08-01', items: 1, total: 34.99, status: 'Delivered' },
  { id: 'BH-1041', customer: 'Ethan Cole', email: 'ethan@example.com', date: '2026-07-29', items: 2, total: 25.98, status: 'Delivered' },
  { id: 'BH-1040', customer: 'Maya Lindqvist', email: 'maya@example.com', date: '2026-07-27', items: 5, total: 89.94, status: 'Cancelled' }
];

/* The server database holds every order placed through the site. When it is
   unreachable, fall back to this browser's mirror, then to the samples. */
let ORDERS = SAMPLE_ORDERS;

async function loadOrders() {
  try {
    const token = (() => { try { return localStorage.getItem('bookhaven.auth') || ''; } catch (e) { return ''; } })();
    const res = await fetch(API_BASE + '/api/orders', { headers: token ? { Authorization: 'Bearer ' + token } : {} });
    if (res.ok) {
      const list = await res.json();
      if (Array.isArray(list) && list.length) {
        ORDERS = list.map((o) => ({ ...o, id: o.order_ref || o.id }));
        return;
      }
    }
  } catch (e) { /* fall back below */ }
  try {
    const raw = localStorage.getItem(ORDERS_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    if (Array.isArray(parsed) && parsed.length) { ORDERS = parsed; return; }
  } catch (e) { /* ignore */ }
  ORDERS = SAMPLE_ORDERS;
}

const STATUS_CLASS = {
  Delivered: 'status-delivered',
  Shipped: 'status-shipped',
  Processing: 'status-processing',
  Cancelled: 'status-cancelled'
};

function renderOrders() {
  $('#orders-tbody').innerHTML = ORDERS.map((o) => `
    <tr>
      <td><strong>${o.id}</strong></td>
      <td><strong>${o.customer}</strong><br><span style="font-size:12px;color:var(--muted)">${o.email}</span></td>
      <td>${o.date}</td>
      <td>${o.items}</td>
      <td class="cell-price">${fmt(o.total)}</td>
      <td><span class="status-badge ${STATUS_CLASS[o.status] || 'status-processing'}">${o.status}</span></td>
    </tr>`).join('');
}

/* ---------- 06b. Contact messages (server-backed) ---------- */
/* Messages come from the /api/contact endpoint. If the server is unreachable
   they show as an empty list (the storefront falls back to opening the
   visitor's own email app), so nothing displayed here is ever fabricated. */
let MESSAGES = [];

async function loadMessages() {
  let token = '';
  try { token = localStorage.getItem('bookhaven.auth') || ''; } catch (e) { /* ignore */ }
  try {
    const res = await fetch(API_BASE + '/api/contact', { headers: token ? { Authorization: 'Bearer ' + token } : {} });
    if (res.ok) {
      const list = await res.json();
      if (Array.isArray(list)) { MESSAGES = list; return; }
    }
  } catch (e) { /* fall back below */ }
  MESSAGES = [];
}

const fmtDate = (d) => String(d || '').replace('T', ' ').slice(0, 16) || '—';

function renderMessages() {
  const tbody = $('#messages-tbody');
  if (!tbody) return;
  tbody.innerHTML = MESSAGES.length ? MESSAGES.map((m) => `
    <tr>
      <td><strong>${escapeHtml(m.name)}</strong><br><span style="font-size:12px;color:var(--muted)">${escapeHtml(m.email)}</span></td>
      <td><strong>${escapeHtml(m.subject || 'General')}</strong></td>
      <td class="msg-cell" title="${escapeHtml(m.message)}">${escapeHtml(m.message)}</td>
      <td>${fmtDate(m.created_at)}</td>
      <td class="col-actions">
        <div class="row-actions">
          <button class="icon-btn del" data-msg="${m.id}" title="Delete message" aria-label="Delete message from ${escapeHtml(m.name)}">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M6.5 7l1 13h9l1-13" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </button>
        </div>
      </td>
    </tr>`).join('') : '<tr><td colspan="5" class="no-results">No messages yet — they will appear here as visitors use the contact form.</td></tr>';
}

const messagesTbody = $('#messages-tbody');
if (messagesTbody) {
  messagesTbody.addEventListener('click', async (e) => {
    const delBtn = e.target.closest('[data-msg]');
    if (!delBtn) return;
    const id = Number(delBtn.dataset.msg);
    const row = MESSAGES.find((m) => m.id === id);
    if (!row) return;
    if (!confirm(`Delete the message from ${row.name}? This cannot be undone.`)) return;
    try {
      await apiRequest('DELETE', '/api/contact/' + id);
      MESSAGES = MESSAGES.filter((m) => m.id !== id);
      renderMessages();
      toast('Message deleted');
    } catch (err) {
      toast(err.message);
    }
  });
}

/* ---------- 07. Toast ---------- */
const toastEl = $('#admin-toast');
const toastMsg = $('.toast-msg', toastEl);
let toastTimer;

function toast(message) {
  toastMsg.textContent = message;
  toastEl.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('show'), 2600);
}

/* ---------- 08. Init ---------- */
window.addEventListener('admin:authed', async () => {
  await loadOrders();
  renderOrders();
  await loadMessages();
  renderMessages();
  renderDashboard();
});

(async function init() {
  await loadBooks();
  await loadCategories();
  await loadOrders();
  await loadMessages();
  renderDashboard();
  renderBooks();
  renderOrders();
  renderMessages();
})();