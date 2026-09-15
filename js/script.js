/* ==========================================================================
   BookHaven — script.js (multi-page)
   Features:
     01. Books data (served by the backend API — DB is the source of truth)
     02. Helpers & SVG icons
     03. Book card renderer
     04. Per-page rendering (home, bestsellers, new-releases, deals, categories)
     05. Cart (localStorage + badge) & wishlist (localStorage + hearts)
     06. Live search filtering
     07. Newsletter validation (main + footer forms)
     08. Mobile drawer
     09. Navbar shadow, active link, back-to-top, smooth scroll, reveal
     10. Toast notifications
   ========================================================================== */
'use strict';

/* ---------- 01. Books data ----------
   Books come from the backend (GET /api/books -> SQLite), which is the one
   source of truth. The last API response is cached in localStorage so the
   site can still display data while the server is unreachable; the cache is
   refreshed on every successful fetch, so it can never go stale. */
const BOOKS_CACHE_KEY = 'bookhaven.books';

function loadBooksFromCache() {
  let list = null;
  try {
    const raw = localStorage.getItem(BOOKS_CACHE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    if (Array.isArray(parsed) && parsed.length) list = parsed;
  } catch (e) { /* ignore */ }
  return list || [];
}

let BOOKS = [];

async function loadBooks() {
  try {
    const res = await fetch(API_BASE + '/api/books');
    if (!res.ok) throw new Error('API unavailable');
    const ct = res.headers.get('content-type') || '';
    if (!ct.includes('application/json')) throw new Error('Not the BookHaven backend');
    const data = await res.json();
    if (Array.isArray(data) && data.length) {
      BOOKS = data;
      try { localStorage.setItem(BOOKS_CACHE_KEY, JSON.stringify(data)); } catch (e) { /* ignore */ }
      return;
    }
  } catch (e) { /* fall back to cache */ }
  BOOKS = loadBooksFromCache();
}

/* Categories with their blurb/icon are UI chrome; the names themselves and
   the subgenre pills are refreshed from the database when reachable. */
const CATEGORY_META = {
  'Fiction':               { blurb: 'Stories that stay with you',   icon: 'book' },
  'Science':               { blurb: 'Understand the universe',      icon: 'flask' },
  'Business':              { blurb: 'Grow your ambitions',          icon: 'briefcase' },
  'Technology':            { blurb: 'Master the modern world',      icon: 'cpu' },
  'Romance':               { blurb: 'Love in every chapter',        icon: 'heart' },
  "Children's":            { blurb: 'Where imaginations grow',      icon: 'balloon' },
  'History':               { blurb: 'Explore the past',             icon: 'landmark' },
  'Young Adult':           { blurb: 'Stories for new voices',       icon: 'spark' },
  'Self-Help':             { blurb: 'Grow from within',             icon: 'grow' },
  'Biography':             { blurb: 'Remarkable lives, told',       icon: 'user' },
  'Cook Books & Wine':     { blurb: 'Feast for every table',        icon: 'glass' }
};

const CATEGORIES = Object.keys(CATEGORY_META).map((name) => ({ name, ...CATEGORY_META[name] }));

/* ---------- 02b. Subgenres per category (accordion pills) ---------- */
/* Fallback used only while the server is unreachable; the API supplies the
   real subgenres stored in the database. */
const FALLBACK_SUBCATEGORIES = {
  'Fiction': ['Mystery, Thriller & Suspense', 'Fantasy', 'Science Fiction', 'Historical Fiction', 'Literary Fiction', 'Adventure'],
  'Science': ['Physics', 'Chemistry', 'Biology', 'Astronomy', 'Environmental Science', 'Mathematics', 'Popular Science'],
  'Business': ['Entrepreneurship', 'Marketing', 'Finance', 'Leadership', 'Management', 'Investing', 'Personal Development'],
  'Technology': ['Programming', 'Artificial Intelligence', 'Cybersecurity', 'Web Development', 'Data Science', 'Cloud Computing', 'Software Engineering'],
  'Romance': ['Contemporary Romance', 'Historical Romance', 'Romance Fiction', 'Young Adult Romance', 'Paranormal Romance'],
  "Children's": ['Picture Books', 'Bedtime Stories', 'Educational', 'Fairy Tales', 'Early Readers', 'Teen Fiction', 'Classic Kids'],
  'History': ['World History', 'Ancient Civilizations', 'Modern History', 'Military History', 'Cultural History'],
  'Young Adult': ['Contemporary YA', 'Fantasy YA', 'Romance YA', 'Sci-Fi YA', 'Action & Adventure YA'],
  'Self-Help': ['Personal Development', 'Motivation', 'Mindfulness', 'Productivity', 'Relationships', 'Finance & Wealth'],
  'Biography': ['Autobiography', 'Memoir', 'Political Figures', 'Artists & Musicians', 'Business Leaders', 'Scientists'],
  'Cook Books & Wine': ['Baking & Desserts', 'Everyday Cooking', 'International Cuisine', 'Health & Diet', 'Wine & Spirits', 'Beverages']
};

let SUBCATEGORIES = { ...FALLBACK_SUBCATEGORIES };

(async function loadSubcategories() {
  try {
    const res = await fetch(API_BASE + '/api/categories');
    if (!res.ok) return;
    const byCat = await res.json();
    if (byCat && typeof byCat === 'object') SUBCATEGORIES = byCat;
    if (page === 'categories') renderCategoryCards();
  } catch (e) { /* keep fallback */ }
})();

/* ---------- 02. Helpers & icons ---------- */
const $  = (sel, ctx = document) => ctx.querySelector(sel);
const $$ = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));

const formatReviews = (n) => (n >= 1000 ? (n / 1000).toFixed(1) + 'k' : n);
const bookById = (id) => BOOKS.find((b) => b.id === Number(id));
const page = document.body.dataset.page || 'home';

const STAR_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.6l2.8 5.9 6.4.7-4.7 4.4 1.2 6.4L12 17.1l-5.7 3.2 1.2-6.4L2.8 9.2l6.4-.7L12 2.6z"/></svg>';
const HEART_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s-7.5-4.9-9.8-9A5.7 5.7 0 0 1 12 6.3 5.7 5.7 0 0 1 21.8 12c-2.3 4.1-9.8 9-9.8 9z"/></svg>';
const CART_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 4h2l2.2 11.2a1.5 1.5 0 0 0 1.5 1.3h7.6a1.5 1.5 0 0 0 1.5-1.2L20 8H6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><circle cx="10.5" cy="20" r="1.3" fill="currentColor"/><circle cx="17" cy="20" r="1.3" fill="currentColor"/></svg>';

const CATEGORY_ICONS = {
  book: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 6.5C10.4 4.9 7.9 4.3 5.2 4.9v13.6c2.7-.6 5.2 0 6.8 1.6 1.6-1.6 4.1-2.2 6.8-1.6V4.9c-2.7-.6-5.2 0-6.8 1.6z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M12 6.5v13.6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
  flask: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 3h4M11 3v5L6.2 16a1.8 1.8 0 0 0 1.6 2.7h8.4a1.8 1.8 0 0 0 1.6-2.7L13 8V3" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M8.2 13.5h7.6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
  briefcase: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="7" width="18" height="13" rx="2" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 12.5h18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
  cpu: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="7" y="7" width="10" height="10" rx="2" fill="none" stroke="currentColor" stroke-width="1.8"/><rect x="10.5" y="10.5" width="3" height="3" fill="currentColor"/><path d="M10.5 3v2.5M13.5 3v2.5M10.5 18.5V21M13.5 18.5V21M3 10.5h2.5M3 13.5h2.5M18.5 10.5H21M18.5 13.5H21" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
  heart: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s-7.5-4.9-9.8-9A5.7 5.7 0 0 1 12 6.3 5.7 5.7 0 0 1 21.8 12c-2.3 4.1-9.8 9-9.8 9z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>',
  balloon: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="10.5" r="7" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M12 17.5L8.8 22h6.4L12 17.5z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M12 10.5m-2.6 0a2.6 2.6 0 1 0 5.2 0a2.6 2.6 0 1 0-5.2 0" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>',
  landmark: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8l8-4 8 4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M3 8h18" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M5 8v9M9.5 8v9M14.5 8v9M19 8v9" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M3 17h18M4 20h16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
  spark: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l1.9 4.6L18.5 9.5l-4.6 1.9L12 16l-1.9-4.6L5.5 9.5l4.6-1.9L12 3z" fill="currentColor"/><path d="M18.5 15l.9 2.1 2.1.9-2.1.9-.9 2.1-.9-2.1-2.1-.9 2.1-.9.9-2.1z" fill="currentColor"/></svg>',
  grow: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20V9" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M5 9h3v2.5A2.5 2.5 0 0 1 5.5 14 2.5 2.5 0 0 1 3 11.5V9h2zM19 9h-3v2.5a2.5 2.5 0 0 0 2.5 2.5 2.5 2.5 0 0 0 2.5-2.5V9h-2z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  user: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="4" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M4.5 20.5c1.5-3.5 4.2-5 7.5-5s6 1.5 7.5 5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
  glass: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4h14l-6 9v6h-2v-6L5 4z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M5.5 4h13" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>'
};

/* ---------- 03. Book card renderer ---------- */
/* Missing covers are swapped for a generated SVG placeholder so the demo
   catalog always renders something book-like. */
function coverFallback(img) {
  if (!img) return;
  img.onerror = null;
  img.setAttribute('alt', 'Cover of ' + (img.dataset.title || 'book'));
  img.src = coverPlaceholder(img.dataset.title || 'Book', img.dataset.author || 'BookHaven');
}

window.BHcovers = window.BHcovers || { placeholders: new Map() };

function coverPlaceholder(title, author) {
  const key = title + '|' + author;
  const cached = window.BHcovers.placeholders.get(key);
  if (cached) return cached;

  const esc = (s) => String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;');

  const words = String(title).split(/\s+/).slice(0, 4);
  const lines = [];
  let cur = '';
  words.forEach((w) => {
    if ((cur + ' ' + w).trim().length <= 18) cur = (cur + ' ' + w).trim();
    else { lines.push(cur); cur = w; }
  });
  if (cur) lines.push(cur);
  const text = lines.slice(0, 4).map((l) => esc(l)).join('</tspan><tspan x="300">');
  const authorText = esc(String(author));
  const golden = '#c9a227';
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="900" viewBox="0 0 600 900">
      <defs>
        <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#1c1c22"/>
          <stop offset="1" stop-color="#0b0b0e"/>
        </linearGradient>
        <linearGradient id="go" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stop-color="#e0bc4b"/><stop offset="1" stop-color="#c9a227"/>
        </linearGradient>
      </defs>
      <rect width="600" height="900" rx="22" fill="url(#g)"/>
      <rect x="26" y="26" width="548" height="848" rx="16" fill="none" stroke="#c9a227" stroke-opacity=".35" stroke-width="2"/>
      <rect x="240" y="120" width="120" height="4" fill="url(#go)"/>
      <text x="300" y="205" font-family="Georgia,serif" font-size="23" font-weight="bold" fill="#e0bc4b" text-anchor="middle" letter-spacing="4">BOOKHAVEN</text>
      <g font-family="Georgia,serif" font-size="38" font-weight="bold" fill="#f6f1e4" text-anchor="middle">
        <text x="300" y="470">
          <tspan x="300">` + text + `</tspan>
        </text>
      </g>
      <line x1="250" y1="560" x2="350" y2="560" stroke="#c9a227" stroke-opacity=".5" stroke-width="1.5"/>
      <text x="300" y="640" font-family="Arial,sans-serif" font-size="22" fill="#9a978e" text-anchor="middle">` + authorText + `</text>
      <text x="300" y="820" font-family="Arial,sans-serif" font-size="14" fill="#6f6f78" text-anchor="middle" letter-spacing="3">FICTION &amp; MORE</text>
    </svg>`;

  const uri = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  window.BHcovers.placeholders.set(key, uri);
  return uri;
}

function bookCard(book) {
  const wished = store.wishlist.includes(book.id);
  const inStock = book.stock == null || book.stock > 0;
  const discount = book.oldPrice ? Math.round((1 - book.price / book.oldPrice) * 100) : null;
  const badge = book.isNew
    ? '<span class="badge badge-new">New</span>'
    : discount
      ? `<span class="badge badge-deal">-${discount}%</span>`
      : '';

  return `
  <article class="book-card" data-id="${book.id}">
    <div class="book-cover">
      <img src="${book.cover}" alt="Cover of ${book.title}" loading="lazy"
           data-title="${String(book.title).replace(/"/g, '&quot;')}"
           data-author="${String(book.author).replace(/"/g, '&quot;')}"
           onerror="BHcovers && BHcovers.fallback ? BHcovers.fallback(this) : coverFallback(this)">
      ${badge}
      ${inStock ? '' : '<span class="badge badge-oos">Out of Stock</span>'}
      <span class="quick-view">View Details</span>
    </div>
    <div class="book-info">
      <h3 class="book-title">${book.title}</h3>
      <p class="book-author">${book.author}</p>
      <div class="book-rating">
        <span class="stars" role="img" aria-label="${book.rating} out of 5 stars">
          <span class="stars-bg">${STAR_SVG.repeat(5)}</span>
          <span class="stars-fill" style="width:${(book.rating / 5) * 100}%">${STAR_SVG.repeat(5)}</span>
        </span>
        <span class="rating">${book.rating}</span>
        <span class="rating-count">(${formatReviews(book.reviews)})</span>
      </div>
      <div class="book-bottom">
        <div class="book-price">
          ${book.oldPrice ? `<span class="price-old">${fmtPrice(book.oldPrice)}</span>` : ''}
          <span class="price">${fmtPrice(book.price)}</span>
        </div>
        <div class="book-actions">
          <button class="action-btn add-btn${inStock ? '' : ' disabled'}" data-add="${book.id}"
                  data-tooltip="${inStock ? 'Add to Cart' : 'Out of stock'}"
                  aria-label="Add ${book.title} to cart" ${inStock ? '' : 'disabled'}>
            ${CART_SVG}
          </button>
          <button class="action-btn wish-btn${wished ? ' active' : ''}" data-wish="${book.id}"
                  data-tooltip="${wished ? 'Remove from wishlist' : 'Add to Wishlist'}"
                  aria-label="Add ${book.title} to wishlist" aria-pressed="${wished}">
            ${HEART_SVG}
          </button>
        </div>
      </div>
    </div>
  </article>`;
}

window.BHcovers.fallback = coverFallback;

function renderGrid(container, books) {
  if (!container) return;
  createPagedGrid(container, books);
}

/* ---------- 03b. Paged grids ----------
   The catalog holds 500+ books per category, so large result sets are
   rendered incrementally (60 at a time) with a "Show more" button instead
   of trying to build thousands of DOM nodes at once. Horizontal carousels
   and small arrays render in full. */
const PAGE_SIZE = 60;
const pagedState = new Map(); // element -> { all, shown }

function createPagedGrid(container, books) {
  const all = Array.isArray(books) ? books : [];
  if (container.classList.contains('carousel') || all.length <= PAGE_SIZE) {
    pagedState.delete(container);
    container.innerHTML = all.length
      ? all.map(bookCard).join('')
      : '<p class="no-results">No books found. Try a different search.</p>';
    return;
  }
  pagedState.set(container, { all, shown: 0 });
  container.innerHTML = '';
  loadMoreInto(container);
}

function loadMoreInto(container) {
  const st = pagedState.get(container);
  if (!st) return;
  const start = st.shown;
  const end = Math.min(st.all.length, start + PAGE_SIZE);
  const chunk = st.all.slice(start, end);

  const frag = document.createElement('div');
  frag.innerHTML = chunk.map(bookCard).join('');

  let wrap = container.querySelector('.load-more-wrap');
  while (frag.firstChild) container.insertBefore(frag.firstChild, wrap);

  st.shown = end;
  const remaining = st.all.length - end;

  if (remaining > 0) {
    if (!wrap) {
      wrap = document.createElement('div');
      wrap.className = 'load-more-wrap';
      container.appendChild(wrap);
    }
    wrap.innerHTML = `<button type="button" class="btn btn-ghost load-more" data-more>Show more (${remaining} more)</button>`;
  } else if (wrap) {
    wrap.remove();
  }
}

/* ---------- 04. Per-page rendering ---------- */
function renderPage() {
  switch (page) {
    case 'bestsellers':
      renderGrid($('#best-grid'), BOOKS.filter((b) => b.bestseller)
        .sort((a, b) => b.rating - a.rating));
      break;

    case 'new-releases':
      renderGrid($('#new-grid'), BOOKS.filter((b) => b.isNew));
      break;

    case 'deals':
      renderGrid($('#deals-grid'), BOOKS.filter((b) => b.oldPrice)
        .sort((a, b) => (b.oldPrice / b.price) - (a.oldPrice / a.price)));
      break;

    case 'categories':
      renderCategoryCards();
      if (showAllBooks) renderCategoryGroups(BOOKS);
      else if (activeGenre) renderCategoryGroups(
        BOOKS.filter((b) => matchesGenre(b, activeGenre.cat, activeGenre.genre)), activeGenre.genre);
      else renderCategoryPrompt();
      updateFilterBar();
      break;

    case 'cart':
      renderCart();
      break;

    case 'wishlist':
      renderWishlist();
      break;

    default: // home
      renderGrid($('#featured-carousel'), BOOKS.filter((b) => b.featured));
  }
}

/* Categories page: accordion cards with subgenre pills */
function renderCategoryCards() {
  const grid = $('#category-grid');
  if (!grid) return;
  grid.innerHTML = CATEGORIES.map((cat) => {
    const count = BOOKS.filter((b) => b.category === cat.name).length;
    const pills = (SUBCATEGORIES[cat.name] || [])
      .map((g) =>
        `<button type="button" class="pill" data-cat="${cat.name}" data-genre="${g}">${g}</button>`)
      .join('');
    return `
    <article class="category-card acc-card" data-cat="${cat.name}">
      <div class="acc-head" role="button" tabindex="0" aria-expanded="false">
        <span class="category-icon">${CATEGORY_ICONS[cat.icon] || CATEGORY_ICONS.book}</span>
        <span class="acc-info">
          <h3>${cat.name}</h3>
          <p>${count} title${count === 1 ? '' : 's'} · ${cat.blurb}</p>
        </span>
        <span class="acc-arrow" aria-hidden="true">
          <svg viewBox="0 0 24 24"><path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </span>
      </div>
      <div class="acc-panel-wrap">
        <div class="acc-panel">
          <div class="acc-pills">${pills}</div>
        </div>
      </div>
    </article>`;
  }).join('');
}

/* Accordion: only one category open at a time */
let expandedCategory = null;

function toggleAccordion(card) {
  if (!card) return;
  const name = card.dataset.cat;
  if (expandedCategory && expandedCategory !== name) {
    setExpanded($(`.acc-card[data-cat="${expandedCategory}"]`), false);
  }
  setExpanded(card, expandedCategory !== name);
}

function setExpanded(card, open) {
  if (!card) return;
  card.classList.toggle('expanded', open);
  const head = card.querySelector('.acc-head');
  if (head) head.setAttribute('aria-expanded', open);
  const wrap = card.querySelector('.acc-panel-wrap');
  if (wrap) wrap.classList.toggle('open', open);
  expandedCategory = open ? card.dataset.cat : null;
}

/* Genre pill filter -> filters the books section below */
let activeGenre = null;
let showAllBooks = false;

/* A book belongs to a genre when its category matches AND its stored
   subcategory equals the chosen genre (case-insensitive). */
function matchesGenre(b, cat, genre) {
  return b.category === cat &&
    String(b.subcategory || '').trim().toLowerCase() ===
    String(genre || '').trim().toLowerCase();
}

function selectGenre(cat, genre) {
  activeGenre = { cat, genre };
  showAllBooks = false;
  renderCategoryGroups(BOOKS.filter((b) => matchesGenre(b, cat, genre)), genre);

  $$('.pill').forEach((p) =>
    p.classList.toggle('active', p.dataset.cat === cat && p.dataset.genre === genre));
  const headTitle = $('#category-books .section-title');
  if (headTitle) headTitle.innerHTML = `${cat} — <span class="gold">${genre}</span>`;

  updateFilterBar();
  const target = $('#category-books');
  if (target) target.scrollIntoView({ behavior: 'smooth' });
}

/* Show the whole catalog grouped by category */
function showAllBooksView() {
  activeGenre = null;
  showAllBooks = true;
  renderCategoryGroups(BOOKS);

  $$('.pill').forEach((p) => p.classList.remove('active'));
  const headTitle = $('#category-books .section-title');
  if (headTitle) headTitle.innerHTML = 'Every <span class="gold">Title</span>, Sorted';

  updateFilterBar();
  const target = $('#category-books');
  if (target) target.scrollIntoView({ behavior: 'smooth' });
}

/* Hide books again and return to the sub-genre picker prompt */
function collapseBooks() {
  activeGenre = null;
  showAllBooks = false;
  renderCategoryPrompt();

  $$('.pill').forEach((p) => p.classList.remove('active'));
  const headTitle = $('#category-books .section-title');
  if (headTitle) headTitle.innerHTML = 'Your <span class="gold">Selection</span>';

  updateFilterBar();
  const target = $('#category-books');
  if (target) target.scrollIntoView({ behavior: 'smooth' });
}

/* Filter bar reflects the current view state */
function updateFilterBar() {
  const bar = $('#filter-bar');
  if (!bar) return;
  const label = $('#filter-title');
  const btn = $('#reset-filter');

  if (activeGenre) {
    bar.hidden = false;
    if (label) label.innerHTML = `Showing <strong>${activeGenre.cat} — ${activeGenre.genre}</strong>`;
    if (btn) btn.textContent = 'Show All Books';
  } else if (showAllBooks) {
    bar.hidden = false;
    if (label) label.textContent = 'Showing the full catalog';
    if (btn) btn.textContent = 'Close';
  } else {
    bar.hidden = true;
  }
}

/* Categories page: placeholder shown until a sub-genre is picked */
function renderCategoryPrompt() {
  const wrap = $('#cat-groups');
  if (!wrap) return;
  wrap.innerHTML = `
    <div class="cat-prompt">
      <span class="cat-prompt-icon">${CATEGORY_ICONS.book}</span>
      <h3>Pick a sub-genre</h3>
      <p>Choose a category above, then tap a sub-genre to see its books.</p>
    </div>`;
}

/* Categories page: all books grouped by genre */
function renderCategoryGroups(books, genre = null) {
  const wrap = $('#cat-groups');
  if (!wrap) return;
  wrap.innerHTML = CATEGORIES.map((cat) => {
    const items = books.filter((b) => b.category === cat.name);
    if (!items.length) return '';
    const title = genre && activeGenre && cat.name === activeGenre.cat ? genre : cat.name;
    return `
    <section class="cat-group" id="cat-${cat.name}">
      <div class="cat-group-head">
        <h3 class="cat-group-title">${title}</h3>
        <span class="cat-group-count">${items.length}</span>
      </div>
      <div class="book-grid" data-cat="${cat.name}"></div>
    </section>`;
  }).join('');

  $$('#cat-groups .book-grid').forEach((grid) => {
    const catName = grid.dataset.cat;
    createPagedGrid(grid, books.filter((b) => b.category === catName));
  });

  if (!$('#cat-groups .cat-group')) {
    wrap.innerHTML = '<p class="no-results">No books found. Try a different search.</p>';
  }
}

/* Cart page: line items + order summary */
function renderCart() {
  const wrap = $('#cart-items');
  if (!wrap) return;

  const lines = store.cart
    .map((item) => ({ qty: item.qty, book: bookById(item.id) }))
    .filter((item) => item.book);

  const summary = $('#cart-summary');
  const empty = $('#cart-empty');
  const layout = $('#cart-layout');

  if (!lines.length) {
    wrap.innerHTML = '';
    if (summary) summary.hidden = true;
    if (layout) layout.hidden = true;
    if (empty) empty.hidden = false;
    return;
  }

  if (layout) layout.hidden = false;
  if (empty) empty.hidden = true;

  wrap.innerHTML = lines.map(({ book, qty }) => `
    <article class="cart-item">
      <img class="cart-item-cover" src="${book.cover}" alt="Cover of ${book.title}">
      <div class="cart-item-info">
        <h3>${book.title}</h3>
        <p>${book.author}</p>
        <span class="cart-item-price">${fmtPrice(book.price)} each</span>
      </div>
      <div class="qty-stepper" aria-label="Quantity">
        <button class="qty-btn" data-dec="${book.id}" aria-label="Decrease quantity">&minus;</button>
        <span class="qty-num">${qty}</span>
        <button class="qty-btn" data-inc="${book.id}" aria-label="Increase quantity">+</button>
      </div>
      <p class="cart-line-total">${fmtPrice(book.price * qty)}</p>
      <button class="remove-btn" data-remove="${book.id}" aria-label="Remove ${book.title} from cart">&times;</button>
    </article>`).join('');

  const subtotal = lines.reduce((s, { book, qty }) => s + book.price * qty, 0);
  const shipping = subtotal >= 35 ? 0 : 4.99;
  const total = subtotal + shipping;

  summary.hidden = false;
  summary.innerHTML = `
    <h3 class="cart-summary-title">Order Summary</h3>
    <div class="summary-row"><span>Subtotal</span><span>${fmtPrice(subtotal)}</span></div>
    <div class="summary-row"><span>Shipping</span><span>${shipping === 0 ? '<span class="free">Free</span>' : fmtPrice(shipping)}</span></div>
    <div class="summary-row summary-total"><span>Total</span><span>${fmtPrice(total)}</span></div>
    <button class="btn btn-gold btn-block" data-checkout>Checkout</button>
    <a href="categories.html" class="continue-link">Continue shopping</a>`;
}

/* Wishlist page: saved books grid */
function renderWishlist() {
  const grid = $('#wishlist-grid');
  if (!grid) return;

  const books = store.wishlist.map(bookById).filter(Boolean);
  const empty = $('#wishlist-empty');

  if (books.length) {
    grid.innerHTML = books.map(bookCard).join('');
    if (empty) empty.hidden = true;
  } else {
    grid.innerHTML = '';
    if (empty) empty.hidden = false;
  }
}

/* Cart mutations */
function changeQty(id, delta) {
  const line = store.cart.find((i) => i.id === Number(id));
  if (!line) return;
  line.qty += delta;
  if (line.qty <= 0) store.cart = store.cart.filter((i) => i.id !== line.id);
  saveStore();
  updateCartBadge();
  renderCart();
}

function removeFromCart(id) {
  store.cart = store.cart.filter((i) => i.id !== Number(id));
  saveStore();
  updateCartBadge();
  renderCart();
  showToast('Removed from cart');
}

/* ---------- 05. Cart & wishlist ---------- */
const STORE_KEYS = { cart: 'bookhaven.cart', wishlist: 'bookhaven.wishlist' };

const store = {
  cart: JSON.parse(localStorage.getItem(STORE_KEYS.cart) || '[]'),      // [{ id, qty }]
  wishlist: JSON.parse(localStorage.getItem(STORE_KEYS.wishlist) || '[]') // [id]
};

const saveStore = () => {
  localStorage.setItem(STORE_KEYS.cart, JSON.stringify(store.cart));
  localStorage.setItem(STORE_KEYS.wishlist, JSON.stringify(store.wishlist));
};

const cartTotal = () => store.cart.reduce((sum, item) => sum + item.qty, 0);

function addToCart(id) {
  const book = bookById(id);
  if (!book) return;
  if (book.stock != null && book.stock <= 0) {
    showToast(`"${book.title}" is out of stock`);
    return;
  }
  const line = store.cart.find((item) => item.id === Number(id));
  if (line) line.qty += 1;
  else store.cart.push({ id: Number(id), qty: 1 });
  saveStore();
  updateCartBadge(true);

  const btn = $(`.add-btn[data-add="${id}"]`);
  if (btn) {
    btn.classList.add('added');
    btn.dataset.tooltip = 'Added ✓';
    setTimeout(() => {
      btn.classList.remove('added');
      btn.dataset.tooltip = 'Add to Cart';
    }, 1400);
  }
  showToast(`"${book.title}" added to cart`);
}

function toggleWishlist(id) {
  const book = bookById(id);
  if (!book) return;
  const index = store.wishlist.indexOf(Number(id));
  const adding = index === -1;
  if (adding) store.wishlist.push(Number(id));
  else store.wishlist.splice(index, 1);
  saveStore();

  $$(`.wish-btn[data-wish="${id}"]`).forEach((btn) => {
    btn.classList.toggle('active', adding);
    btn.setAttribute('aria-pressed', adding);
    btn.dataset.tooltip = adding ? 'Remove from wishlist' : 'Add to Wishlist';
  });
  showToast(adding ? `"${book.title}" added to wishlist` : `"${book.title}" removed from wishlist`);
}

function updateCartBadge(pop = false) {
  const badge = $('#cart-count');
  if (!badge) return;
  badge.textContent = cartTotal();
  if (pop) {
    badge.classList.remove('pop');
    void badge.offsetWidth; // restart animation
    badge.classList.add('pop');
  }
}

/* ---------- 06. Live search ---------- */
const searchInput = $('#nav-search');
const searchableText = (b) => [b.title, b.author, b.category, b.subcategory].join(' ').toLowerCase();

function applySearch(query) {
  const q = query.trim().toLowerCase();
  if (!q) { renderPage(); return; }

  if (page === 'categories') {
    // A new search replaces any active genre filter / full-catalog view
    activeGenre = null;
    showAllBooks = false;
    updateFilterBar();
    const headTitle = $('#category-books .section-title');
    if (headTitle) headTitle.innerHTML = 'Every <span class="gold">Title</span>, Sorted';
    $$('.pill').forEach((p) => p.classList.remove('active'));
    const matched = BOOKS.filter((b) => searchableText(b).includes(q));
    renderCategoryGroups(matched);
    return;
  }

  let container = null;
  if (page === 'bestsellers') container = $('#best-grid');
  else if (page === 'new-releases') container = $('#new-grid');
  else if (page === 'deals') container = $('#deals-grid');
  else container = $('#featured-carousel');

  renderGrid(container, BOOKS.filter((b) => searchableText(b).includes(q)));

  // Refresh carousel arrow states after re-render
  if (container === $('#featured-carousel')) {
    requestAnimationFrame(() => container.dispatchEvent(new Event('scroll')));
  }
}

let searchTimer;
if (searchInput) {
  searchInput.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => applySearch(searchInput.value), 220);
  });
}

/* ---------- 07. Newsletter validation ---------- */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function bindNewsletter(form, msg) {
  if (!form) return;
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const input = form.querySelector('input[type="email"]');
    const email = input.value.trim();

    if (!EMAIL_RE.test(email)) {
      msg.textContent = 'Please enter a valid email address.';
      msg.className = msg.classList.contains('footer-newsletter-msg') ? 'footer-newsletter-msg err' : 'newsletter-msg err';
      input.focus();
      return;
    }

    msg.textContent = "You're in! Check your inbox for your 10% welcome code.";
    msg.className = msg.classList.contains('footer-newsletter-msg') ? 'footer-newsletter-msg ok' : 'newsletter-msg ok';
    input.disabled = true;
    const btn = form.querySelector('button');
    if (btn) { btn.disabled = true; btn.textContent = 'Subscribed'; }
    showToast('Subscription confirmed. Welcome to BookHaven!');
  });
}

bindNewsletter($('#newsletter-form'), $('#newsletter-msg'));

const footerForm = $('.footer-newsletter');
if (footerForm && !$('.footer-newsletter-msg', footerForm.parentElement)) {
  const msg = document.createElement('p');
  msg.className = 'footer-newsletter-msg';
  footerForm.after(msg);
  bindNewsletter(footerForm, msg);
}

/* ---------- 08. Mobile drawer ---------- */
const hamburger = $('#hamburger');
const drawer = $('#drawer');
const overlay = $('#drawer-overlay');

const openDrawer = () => {
  drawer.classList.add('open');
  overlay.classList.add('show');
  hamburger.classList.add('active');
  hamburger.setAttribute('aria-expanded', 'true');
  document.body.style.overflow = 'hidden';
};

const closeDrawer = () => {
  drawer.classList.remove('open');
  overlay.classList.remove('show');
  hamburger.classList.remove('active');
  hamburger.setAttribute('aria-expanded', 'false');
  document.body.style.overflow = '';
};

hamburger.addEventListener('click', () =>
  drawer.classList.contains('open') ? closeDrawer() : openDrawer());
$('#drawer-close').addEventListener('click', closeDrawer);
overlay.addEventListener('click', closeDrawer);
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeDrawer(); });

/* ---------- 09. Navbar, active link, to-top, smooth scroll, reveal ---------- */
const navbar = $('#navbar');
const toTop = $('#to-top');

const onScroll = () => {
  const y = window.scrollY;
  navbar.classList.toggle('scrolled', y > 40);
  toTop.classList.toggle('show', y > 600);
};

window.addEventListener('scroll', onScroll, { passive: true });

toTop.addEventListener('click', () =>
  window.scrollTo({ top: 0, behavior: 'smooth' }));

/* Active nav link per page */
const activeLink = $(`.nav-link[data-target="${page}"]`);
if (activeLink) activeLink.classList.add('active');

/* Smooth scroll for in-page anchors (drawer links, Shop Now, scroll hint) */
$$('a[href^="#"]').forEach((link) => {
  link.addEventListener('click', (e) => {
    const target = document.querySelector(link.getAttribute('href'));
    if (!target) return;
    e.preventDefault();
    closeDrawer();
    target.scrollIntoView({ behavior: 'smooth' });
  });
});

/* Scroll reveal */
const revealObserver = new IntersectionObserver((entries) => {
  entries.forEach((entry) => {
    if (entry.isIntersecting) {
      entry.target.classList.add('visible');
      revealObserver.unobserve(entry.target);
    }
  });
}, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });

$$('.reveal').forEach((el) => revealObserver.observe(el));

/* ---------- 10. Toast ---------- */
const toast = document.createElement('div');
toast.className = 'toast';
toast.setAttribute('role', 'status');
toast.setAttribute('aria-live', 'polite');
toast.innerHTML = `<span class="toast-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg></span><span class="toast-msg"></span>`;
document.body.appendChild(toast);

const toastMsg = $('.toast-msg', toast);
let toastTimer;

function showToast(message) {
  toastMsg.textContent = message;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 2600);
}

/* ---------- 11. Book detail (quick view) modal ----------
   Clicking a book card opens a modal showing the book's content: what the
   book is about (description), its genre placement, price and availability. */
let bmEl = null;
let bmBook = null;

function ensureBookModal() {
  if (bmEl) return;
  bmEl = document.createElement('div');
  bmEl.className = 'book-modal-overlay';
  bmEl.innerHTML = `
    <div class="book-modal" role="dialog" aria-modal="true" aria-labelledby="book-modal-title">
      <button type="button" class="book-modal-close" aria-label="Close">&times;</button>
      <div class="book-modal-cover">
        <img id="bm-cover" alt="">
        <span class="book-modal-badge" id="bm-badge"></span>
      </div>
      <div class="book-modal-body">
        <span class="book-modal-crumb" id="bm-crumb"></span>
        <h2 id="book-modal-title"></h2>
        <p class="book-modal-author" id="bm-author"></p>
        <div class="book-modal-rating">
          <span class="stars" id="bm-stars"></span>
          <span id="bm-rating"></span>
        </div>
        <p class="book-modal-desc" id="bm-desc"></p>
        <div class="book-modal-price" id="bm-price"></div>
        <p class="book-modal-stock" id="bm-stock"></p>
        <div class="book-modal-actions">
          <button type="button" class="btn btn-gold" id="bm-add"></button>
          <button type="button" class="book-modal-wish" id="bm-wish"></button>
        </div>
      </div>
    </div>`;
  document.body.appendChild(bmEl);

  bmEl.addEventListener('click', (e) => {
    if (e.target === bmEl || e.target.closest('.book-modal-close')) closeBookModal();
    if (bmBook && e.target.closest('#bm-add')) { addToCart(bmBook.id); renderBookModal(); }
    if (bmBook && e.target.closest('#bm-wish')) { toggleWishlist(bmBook.id); renderBookModal(); }
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeBookModal(); });
}

function openBookDetails(book) {
  if (!book) return;
  bmBook = book;
  ensureBookModal();
  renderBookModal();
  document.body.style.overflow = 'hidden';
  bmEl.classList.add('open');
}

function closeBookModal() {
  bmBook = null;
  if (bmEl) bmEl.classList.remove('open');
  document.body.style.overflow = '';
}

function renderBookModal() {
  if (!bmBook || !bmEl) return;
  const b = bmBook;
  const inStock = b.stock == null || b.stock > 0;
  const discount = b.oldPrice ? Math.round((1 - b.price / b.oldPrice) * 100) : null;

  const cover = $('#bm-cover', bmEl);
  if (cover) {
    cover.dataset.title = b.title; cover.dataset.author = b.author;
    cover.onerror = function () { coverFallback(this); };
    cover.src = b.cover; cover.alt = 'Cover of ' + b.title;
  }

  const badge = $('#bm-badge', bmEl);
  if (b.isNew && discount) badge.textContent = 'New · -' + discount + '%';
  else if (b.isNew) badge.textContent = 'New Release';
  else if (discount) badge.textContent = '-' + discount + '% Off';
  badge.hidden = !(b.isNew || discount);
  badge.className = 'book-modal-badge ' + (discount && !b.isNew ? 'deal' : 'new');

  const crumb = $('#bm-crumb', bmEl);
  if (crumb) crumb.textContent = [b.category, b.subcategory].filter(Boolean).join(' · ');
  $('#book-modal-title', bmEl).textContent = b.title;
  $('#bm-author', bmEl).textContent = 'by ' + b.author;

  const starsEl = $('#bm-stars', bmEl);
  starsEl.innerHTML =
    `<span class="stars-bg">${STAR_SVG.repeat(5)}</span>` +
    `<span class="stars-fill" style="width:${(b.rating / 5) * 100}%">${STAR_SVG.repeat(5)}</span>`;
  $('#bm-rating', bmEl).textContent = `${b.rating} · ${formatReviews(b.reviews)} reviews`;

  const desc = $('#bm-desc', bmEl);
  desc.textContent = b.description || 'No description yet — check back soon.';
  desc.classList.toggle('muted', !b.description);

  const price = $('#bm-price', bmEl);
  price.innerHTML =
    (b.oldPrice ? `<span class="price-old">${fmtPrice(b.oldPrice)}</span>` : '') +
    `<span class="price">${fmtPrice(b.price)}</span>`;

  const stock = $('#bm-stock', bmEl);
  stock.textContent = inStock
    ? (b.stock != null ? `${b.stock} in stock` : 'Available')
    : 'Out of stock';
  stock.classList.toggle('out', !inStock);

  const addBtn = $('#bm-add', bmEl);
  addBtn.disabled = !inStock;
  addBtn.innerHTML = CART_SVG + (inStock ? ' Add to Cart' : ' Out of Stock');

  const wishBtn = $('#bm-wish', bmEl);
  const wished = store.wishlist.includes(Number(b.id));
  wishBtn.classList.toggle('active', wished);
  wishBtn.innerHTML = HEART_SVG + (wished ? ' In Wishlist' : ' Add to Wishlist');
}

/* ---------- Global delegated events ---------- */
document.addEventListener('click', (e) => {
  const moreBtn = e.target.closest('[data-more]');
  if (moreBtn) {
    const grid = moreBtn.closest('.book-grid, .carousel');
    if (grid) loadMoreInto(grid);
    return;
  }

  const wishBtn = e.target.closest('[data-wish]');
  if (wishBtn) { toggleWishlist(wishBtn.dataset.wish); return; }

  const addBtn = e.target.closest('[data-add]');
  if (addBtn) { addToCart(addBtn.dataset.add); return; }

  const inc = e.target.closest('[data-inc]');
  if (inc) { changeQty(inc.dataset.inc, 1); return; }

  const dec = e.target.closest('[data-dec]');
  if (dec) { changeQty(dec.dataset.dec, -1); return; }

  const remove = e.target.closest('[data-remove]');
  if (remove) { removeFromCart(remove.dataset.remove); return; }

  const card = e.target.closest('.book-card');
  if (card && card.dataset.id) {
    openBookDetails(bookById(card.dataset.id));
    return;
  }

  const pwToggle = e.target.closest('[data-toggle-pw]');
  if (pwToggle) {
    const input = pwToggle.parentElement.querySelector('input');
    const show = input.type === 'password';
    input.type = show ? 'text' : 'password';
    pwToggle.classList.toggle('visible', show);
    pwToggle.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
    input.focus();
    return;
  }

  if (e.target.closest('[data-checkout]')) {
    if (!store.cart.length) {
      showToast('Your cart is empty');
      return;
    }
    window.location.href = 'checkout.html';
  }
});

/* ---------- Category accordion delegation (categories page) ---------- */
const catGrid = $('#category-grid');
if (catGrid) {
  catGrid.addEventListener('click', (e) => {
    const head = e.target.closest('.acc-head');
    if (head) { toggleAccordion(head.closest('.acc-card')); return; }
    const pill = e.target.closest('.pill');
    if (pill) selectGenre(pill.dataset.cat, pill.dataset.genre);
  });

  catGrid.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const head = e.target.closest('.acc-head');
    if (!head) return;
    e.preventDefault();
    toggleAccordion(head.closest('.acc-card'));
  });
}

const resetFilterBtn = $('#reset-filter');
if (resetFilterBtn) {
  resetFilterBtn.addEventListener('click', () => {
    if (activeGenre) showAllBooksView();
    else if (showAllBooks) collapseBooks();
  });
}

/* ---------- Account page ---------- */
const accountForm = $('#account-form');
if (accountForm) {
  let authMode = 'signin'; // 'signin' | 'signup'

  const authTitle = $('#auth-title');
  const authSub = $('#auth-sub');
  const authSubmit = $('#auth-submit');
  const authToggleText = $('#auth-toggle-text');
  const authToggleBtn = $('#auth-toggle-btn');
  const nameField = $('#name-field');
  const confirmField = $('#confirm-field');
  const msg = $('#account-msg');
  const nameInput = $('#account-name');
  const emailInput = $('#account-email');
  const passwordInput = $('#account-password');
  const confirmInput = $('#account-confirm');
  const signedInCard = $('#signedin-card');
  const signedInName = $('#signedin-name');
  const signedInEmail = $('#signedin-email');
  const signOutBtn = $('#signout-btn');

  const AUTH_KEY = 'bookhaven.auth';
  const SESSION_KEY = 'bookhaven.session';
  const getToken = () => { try { return localStorage.getItem(AUTH_KEY) || ''; } catch (e) { return ''; } };
  const setToken = (t) => { try { localStorage.setItem(AUTH_KEY, t); } catch (e) { /* ignore */ } };
  const clearToken = () => { try { localStorage.removeItem(AUTH_KEY); } catch (e) { /* ignore */ } };
  const cacheUser = (user) => { try { localStorage.setItem(SESSION_KEY, JSON.stringify({ user })); } catch (e) { /* ignore */ } };
  const clearCachedUser = () => { try { localStorage.removeItem(SESSION_KEY); } catch (e) { /* ignore */ } };
  const getCachedUser = () => {
    try { return (JSON.parse(localStorage.getItem(SESSION_KEY) || 'null') || {}).user || null; } catch (e) { return null; }
  };

  /* Admin flow: visiting the admin entry (/admin) without a session shows
     the admin sign-in screen on that page. */
  const nextPage = new URLSearchParams(location.search).get('next');

  if (nextPage === 'admin') {
    if (authTitle) authTitle.textContent = 'Admin Sign In';
    if (authSub) authSub.textContent = 'Enter your admin email and password to open the admin panel.';
  }

  const setMode = (mode) => {
    authMode = mode;
    const signup = mode === 'signup';
    if (authTitle) authTitle.textContent = signup ? 'Create Account' : 'Sign In';
    if (authSub) authSub.textContent = signup
      ? 'Join BookHaven — it takes less than a minute.'
      : 'Welcome back — enter your details to access your account.';
    if (authSubmit) authSubmit.textContent = signup ? 'Create Account' : 'Sign In';
    if (authToggleText) authToggleText.textContent = signup ? 'Already have an account?' : "Don't have an account?";
    if (authToggleBtn) authToggleBtn.textContent = signup ? 'Sign in' : 'Create one';
    if (nameField) nameField.hidden = !signup;
    if (confirmField) confirmField.hidden = !signup;
    if (msg) msg.textContent = '';
    if (authSubmit) authSubmit.disabled = false;
  };

  if (authToggleBtn) authToggleBtn.addEventListener('click', () => setMode(authMode === 'signin' ? 'signup' : 'signin'));

  $$('.social-login-btn').forEach((btn) => {
    btn.addEventListener('click', () => showToast(`Continue with ${btn.dataset.social} — coming soon`));
  });

  function showSignedIn(user) {
    if (accountForm) accountForm.hidden = true;
    if (signedInName) signedInName.textContent = user.name;
    if (signedInEmail) signedInEmail.textContent = user.email;
    if (signedInCard) signedInCard.hidden = false;
  }

  if (signOutBtn) {
    signOutBtn.addEventListener('click', async () => {
      try {
        await fetch(API_BASE + '/api/auth/logout', {
          method: 'POST',
          headers: { Authorization: 'Bearer ' + getToken() }
        });
      } catch (e) { /* ignore */ }
      clearToken();
      clearCachedUser();
      if (signedInCard) signedInCard.hidden = true;
      if (accountForm) accountForm.hidden = false;
      if (msg) msg.textContent = '';
      if (authSubmit) authSubmit.disabled = false;
      if (passwordInput) passwordInput.value = '';
      if (confirmInput) confirmInput.value = '';
    });
  }

  accountForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = emailInput.value.trim();
    const password = passwordInput.value;

    if (!EMAIL_RE.test(email)) {
      msg.textContent = 'Please enter a valid email address.';
      msg.className = 'auth-msg err';
      emailInput.focus();
      return;
    }

    if (authMode === 'signup') {
      if (!nameInput.value.trim()) {
        msg.textContent = 'Please enter your name.';
        msg.className = 'auth-msg err';
        nameInput.focus();
        return;
      }
      if (!password || password.length < 6) {
        msg.textContent = 'Password must be at least 6 characters.';
        msg.className = 'auth-msg err';
        passwordInput.focus();
        return;
      }
      if (password !== confirmInput.value) {
        msg.textContent = 'Passwords do not match.';
        msg.className = 'auth-msg err';
        confirmInput.focus();
        return;
      }
    }

    authSubmit.disabled = true;
    msg.textContent = '';
    try {
      const res = await fetch(API_BASE + '/api/auth/' + (authMode === 'signup' ? 'register' : 'login'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: nameInput.value.trim(),
          email,
          password
        })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const ct = res.headers.get('content-type') || '';
        if (!ct.includes('application/json')) {
          throw new Error('Backend not found at this address (HTTP ' + res.status + '). ' + (BOOKHAVEN_SITE_HINT ? 'Open the site at ' + BOOKHAVEN_SITE_HINT + '.' : 'Open the site from the server that hosts it.'));
        }
        throw new Error(data.error || 'Sign-in failed');
      }

      setToken(data.token);
      cacheUser(data.user);
      msg.textContent = authMode === 'signup'
        ? 'Account created — welcome to BookHaven!'
        : 'Signed in — welcome back to BookHaven!';
      msg.className = 'auth-msg ok';
      showToast(authMode === 'signup' ? 'Welcome to BookHaven!' : 'Welcome back to BookHaven!');
      showSignedIn(data.user);
      if (nextPage === 'admin') {
        if (data.user.role === 'admin') {
          window.location.href = '/admin';
          return;
        }
        msg.textContent = 'Signed in, but this account does not have admin access.';
        msg.className = 'auth-msg err';
      }
    } catch (err) {
      if (err instanceof TypeError || /failed to fetch|networkerror|load failed/i.test(String(err.message || err))) {
        msg.textContent = 'Cannot reach the server. Make sure it is running and open the site at ' + (BOOKHAVEN_SITE_HINT || 'its host address') + ', then sign in.';
        msg.className = 'auth-msg err';
      } else {
        msg.textContent = 'Sign-in failed: ' + (err.message || 'please try again');
        msg.className = 'auth-msg err';
      }
    } finally {
      authSubmit.disabled = false;
    }
  });

  (async function restoreSession() {
    try {
      const token = getToken();
      if (!token) return;
      const res = await fetch(API_BASE + '/api/auth/me', { headers: { Authorization: 'Bearer ' + token } });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.user) {
        cacheUser(data.user);
        showSignedIn(data.user);
        if (nextPage === 'admin') {
          if (data.user.role === 'admin') {
            window.location.href = '/admin';
            return;
          }
          msg.textContent = 'Signed in, but this account does not have admin access.';
          msg.className = 'auth-msg err';
        }
      } else {
        clearToken();
      }
    } catch (e) {
      /* Server unreachable — fall back to the cached session */
      const cached = getCachedUser();
      if (cached) {
        showSignedIn(cached);
        if (nextPage === 'admin') {
          if (cached.role === 'admin') {
            window.location.href = '/admin';
            return;
          }
          msg.textContent = 'Signed in, but this account does not have admin access.';
          msg.className = 'auth-msg err';
        }
      }
    }
  })();
}

/* ---------- Featured carousel (arrow toggles) ---------- */
function initFeaturedCarousel() {
  const track = $('#featured-carousel');
  const prev = $('#featured-prev');
  const next = $('#featured-next');
  if (!track || !prev || !next) return;

  const updateButtons = () => {
    const maxScroll = track.scrollWidth - track.clientWidth;
    prev.disabled = track.scrollLeft <= 4;
    next.disabled = track.scrollLeft >= maxScroll - 4;
  };

  const scrollByCard = (dir) => {
    const card = track.querySelector('.book-card');
    const step = card ? card.offsetWidth + 26 : 300;
    track.scrollBy({ left: dir * step, behavior: 'smooth' });
  };

  prev.addEventListener('click', () => scrollByCard(-1));
  next.addEventListener('click', () => scrollByCard(1));
  track.addEventListener('scroll', updateButtons, { passive: true });
  window.addEventListener('resize', updateButtons);
  updateButtons();
}

/* ---------- Init ---------- */
if (location.protocol === 'file:') {
  const bar = document.createElement('div');
  bar.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:9999;background:#c0392b;color:#fff;font:600 13.5px/1.5 Inter,sans-serif;padding:10px 16px;text-align:center';
  bar.textContent = 'Offline mode: showing your saved store data. Sign in and sync by opening ' + (BOOKHAVEN_SITE_HINT || 'the site') + ' with the server running.';
  document.body.prepend(bar);
}

(async function init() {
  /* The /admin route lives on the backend only; when previewing the pages
     from a static dev server (different port), point the footer admin
     links at the backend so they don't 404. */
  if (API_BASE) {
    document.querySelectorAll('a[href="/admin"]').forEach((a) => {
      a.href = API_BASE + '/admin';
    });
  }
  await loadBooks();
  renderPage();
  initFeaturedCarousel();
  updateCartBadge();
  document.dispatchEvent(new CustomEvent('books:loaded'));
})();
