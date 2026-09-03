/* ==========================================================================
   BookHaven — Admin access gate (hidden entry)
   The admin panel is reached by clicking the BookHaven logo in the page
   footer (route /admin; /admin.html is not served). This page shows an
   admin sign-in screen; the panel is revealed only after a successful
   admin login. The session token is shared via localStorage
   ('bookhaven.auth'). Logging out hides the panel again.
   ========================================================================== */
'use strict';

const AUTH_KEY = 'bookhaven.auth';
const SESSION_KEY = 'bookhaven.session';

const adminLayout = document.getElementById('admin-layout');
const loginOverlay = document.getElementById('admin-login');

const getToken = () => { try { return localStorage.getItem(AUTH_KEY) || ''; } catch (e) { return ''; } };
const setToken = (t) => { try { localStorage.setItem(AUTH_KEY, t); } catch (e) { /* ignore */ } };
const clearToken = () => { try { localStorage.removeItem(AUTH_KEY); } catch (e) { /* ignore */ } };

/* Cached copy of the last verified session, so the panel can be shown even
   if the server is briefly unreachable. */
const getCachedUser = () => {
  try { return (JSON.parse(localStorage.getItem(SESSION_KEY) || 'null') || {}).user || null; } catch (e) { return null; }
};
const setCachedUser = (user) => {
  try { localStorage.setItem(SESSION_KEY, JSON.stringify({ user })); } catch (e) { /* ignore */ }
};
const clearCachedUser = () => {
  try { localStorage.removeItem(SESSION_KEY); } catch (e) { /* ignore */ }
};

async function api(path, options = {}) {
  const res = await fetch(API_BASE + path, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) }
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

/* ---------- Show / hide ---------- */
function showLogin(msg) {
  if (adminLayout) adminLayout.hidden = true;
  if (loginOverlay) loginOverlay.classList.add('visible');
  if (msg) {
    const m = document.getElementById('admin-login-msg');
    if (m) { m.textContent = msg; m.className = 'auth-msg err'; }
  }
}

function showPanel(user) {
  if (loginOverlay) loginOverlay.classList.remove('visible');
  if (adminLayout) adminLayout.hidden = false;
  setCachedUser(user);
  /* Let js/admin.js refresh the admin-only data (orders) with the token. */
  window.dispatchEvent(new CustomEvent('admin:authed', { detail: user }));
}

/* ---------- Password reveal toggle ---------- */
document.querySelectorAll('[data-toggle-pw]').forEach((btn) => {
  btn.addEventListener('click', () => {
    const wrap = btn.closest('.password-wrap');
    const input = wrap && wrap.querySelector('input[type="password"], input[type="text"]');
    btn.classList.toggle('show');
    if (input) input.type = input.type === 'password' ? 'text' : 'password';
  });
});

/* ---------- Admin sign-in ---------- */
const loginForm = document.getElementById('admin-login-form');
if (loginForm) {
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('admin-login-email').value.trim();
    const password = document.getElementById('admin-login-password').value;
    const msg = document.getElementById('admin-login-msg');
    const submitBtn = loginForm.querySelector('button[type="submit"]');

    if (!email || !password) {
      if (msg) { msg.textContent = 'Enter your email and password.'; msg.className = 'auth-msg err'; }
      return;
    }
    submitBtn.disabled = true;
    try {
      const data = await api('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password })
      });
      if (data.user && data.user.role === 'admin') {
        setToken(data.token);
        showPanel(data.user);
      } else {
        clearToken();
        clearCachedUser();
        if (msg) { msg.textContent = 'This account does not have admin access.'; msg.className = 'auth-msg err'; }
      }
    } catch (err) {
      if (msg) { msg.textContent = err.message || 'Sign-in failed'; msg.className = 'auth-msg err'; }
    } finally {
      submitBtn.disabled = false;
    }
  });
}

/* ---------- Logout: hide the panel again ---------- */
const logoutBtn = document.getElementById('admin-logout');
if (logoutBtn) {
  logoutBtn.addEventListener('click', async () => {
    try { await api('/api/auth/logout', { method: 'POST', headers: { Authorization: 'Bearer ' + getToken() } }); } catch (e) { /* ignore */ }
    clearToken();
    clearCachedUser();
    showLogin();
  });
}

/* ---------- Init: admin session required to see the panel ---------- */
(async function init() {
  const token = getToken();
  if (!token) return showLogin();
  try {
    const data = await api('/api/auth/me', { headers: { Authorization: 'Bearer ' + token } });
    if (data.user && data.user.role === 'admin') return showPanel(data.user);
    clearToken();
    clearCachedUser();
    showLogin();
  } catch (e) {
    const cached = getCachedUser();
    if (cached && cached.role === 'admin') return showPanel(cached);
    clearToken();
    clearCachedUser();
    showLogin();
  }
})();