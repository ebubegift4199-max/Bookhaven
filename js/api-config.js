/* ==========================================================================
   BookHaven — Frontend API configuration
   The frontend always talks to the backend through this base URL.
   - By default it is empty (''), meaning the API lives on the SAME origin
     as the website (e.g. http://localhost:3000 or https://your-domain.com)
     and every fetch is a relative URL.
   - When the frontend is hosted on a different domain from the backend,
     set API_BASE_URL to the full backend URL, e.g. 'https://api.yoursite.com'
     (the backend must then be started with CORS_ORIGIN set to the site URL).
   ========================================================================== */
'use strict';

const API_BASE = (() => {
  try {
    const cfg = window.__BOOKHAVEN_CONFIG__ || null;
    if (cfg && typeof cfg.API_BASE_URL === 'string' && cfg.API_BASE_URL.trim()) {
      return cfg.API_BASE_URL.replace(/\/+$/, '');
    }
  } catch (e) { /* ignore */ }

  /* Dev convenience: when the page is previewed from a static dev server on
     this machine (e.g. VS Code Live Server at http://127.0.0.1:5500), talk
     to the BookHaven backend running locally on port 3000 so the books API,
     sign-in and the admin panel all keep working. Pages served by the
     backend itself (same origin, port 3000) are unaffected. */
  try {
    const h = location.hostname;
    const isLoopback = h === 'localhost' || h === '127.0.0.1' || h === '::1';
    if (isLoopback && location.port && Number(location.port) !== 3000) {
      return 'http://localhost:3000';
    }
  } catch (e) { /* ignore */ }
  return '';
})();

/* Public site URL, injected by the backend at /config.js. Used in error
   banners instead of a hardcoded localhost address. */
const BOOKHAVEN_SITE_URL = (() => {
  try {
    const cfg = window.__BOOKHAVEN_CONFIG__ || null;
    if (cfg && typeof cfg.SITE_URL === 'string' && cfg.SITE_URL.trim()) {
      return cfg.SITE_URL.replace(/\/+$/, '');
    }
  } catch (e) { /* ignore */ }
  return '';
})();

/* "Open the site at <url>" hint for error banners; falls back to the
   address the page is currently served from. */
const BOOKHAVEN_SITE_HINT = BOOKHAVEN_SITE_URL || location.origin || '';

/* ---------- Price helpers (shared by storefront + admin) ---------- */

/* Display price: ₦ with thousands separators, e.g. ₦14,990.00 */
const fmtPrice = (n) => '₦' + Number(n || 0).toLocaleString('en-US', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
});

/* Format digits typed into a price field with thousands separators,
   keeping up to two decimals: "14990.5" -> "14,990.5". */
const groupPriceInput = (v) => {
  const m = String(v ?? '').match(/^(\d*)(?:\.(\d{0,2}))?.*$/);
  if (!m) return '';
  const int = m[1].replace(/\D/g, '').replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return int + (m[2] ? '.' + m[2] : '');
};

/* Convert a formatted price field back to a plain number string. */
const stripPriceGrouping = (v) => String(v ?? '').replace(/,/g, '');

/* ---------- Static catalog fallback ----------
   When the backend API is unreachable (GitHub Pages, file://, server down),
   pages can still render the catalog from a generated snapshot file
   (js/bookhaven-static-data.js, produced by `npm run export:books`). The
   script is only fetched on demand inside this helper, never on every page
   load while the API works. */
const STATIC_BOOKS_SRC = 'js/bookhaven-static-data.js';

function loadStaticBooks() {
  return new Promise((resolve) => {
    try {
      if (Array.isArray(window.__BOOKHAVEN_STATIC_BOOKS__)) {
        resolve(window.__BOOKHAVEN_STATIC_BOOKS__);
        return;
      }
    } catch (e) { /* ignore */ }
    const s = document.createElement('script');
    s.src = STATIC_BOOKS_SRC;
    s.onload = () => {
      try {
        resolve(Array.isArray(window.__BOOKHAVEN_STATIC_BOOKS__) ? window.__BOOKHAVEN_STATIC_BOOKS__ : []);
      } catch (e) { resolve([]); }
    };
    s.onerror = () => resolve([]);
    document.head.appendChild(s);
  });
}