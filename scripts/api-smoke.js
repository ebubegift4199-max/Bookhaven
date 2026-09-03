/* ==========================================================================
   BookHaven — API smoke test
   Verifies the complete admin flow end to end:
     sign-in (admin) -> admin API (create/update/delete book) ->
     data persisted in the database -> public API reflects it ->
     image upload -> auth/role protection -> orders -> sign-out invalidation

   Run:  node scripts/api-smoke.js   (server must be running on PORT)
   BASE_URL, ADMIN_EMAIL and ADMIN_PASSWORD can override via environment.
   ========================================================================== */
'use strict';

const BASE = process.env.BASE_URL || 'http://localhost:3000';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'ebubegift4199@gmail.com';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'Oluebubegift';

let passed = 0;
let failed = 0;

function ok(label, cond, extra = '') {
  if (cond) { passed++; console.log('  PASS  ' + label); }
  else { failed++; console.log('  FAIL  ' + label + (extra ? ' — ' + extra : '')); }
}

async function req(method, path, { token, body, raw } = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      ...(body && !raw ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: 'Bearer ' + token } : {})
    },
    body: raw ? body : body ? JSON.stringify(body) : undefined
  });
  let data = null;
  try { data = await res.json(); } catch (e) { /* non-JSON */ }
  return { status: res.status, data };
}

async function main() {
  console.log('BookHaven API smoke test against ' + BASE + '\n');

  /* 1. Public pages serve */
  const home = await fetch(BASE + '/');
  ok('Public site served', home.status === 200);

  // 2. Admin sign-in
  const login = await req('POST', '/api/auth/login', { body: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD } });
  ok('Admin sign-in works', login.status === 200 && login.data.token, JSON.stringify(login.data));
  ok('Signed in as role=admin', login.data && login.data.user && login.data.user.role === 'admin');
  const adminToken = login.data.token;

  const me = await req('GET', '/api/auth/me', { token: adminToken });
  ok('Admin session verified via /api/auth/me', me.status === 200 && me.data.user.role === 'admin');

  // 3. Public book list reflects DB (new fields present)
  const books = await req('GET', '/api/books');
  ok('GET /api/books returns books', books.status === 200 && Array.isArray(books.data) && books.data.length > 0);
  const first = books.data[0];
  ok('Book payload includes subcategory/description/stock',
    'subcategory' in first && 'description' in first && 'stock' in first);
  ok('Categories/genres endpoint works', (await req('GET', '/api/categories')).status === 200);

  // 4. Admin edits an existing book -> DB -> public API reflects it
  const original = JSON.parse(JSON.stringify(first));
  const editedPrice = original.price + 1.11;
  const editedStock = original.stock > 0 ? original.stock - 1 : 5;
  const edited = { ...original, price: editedPrice, stock: editedStock, description: 'Edited by smoke test' };
  const put = await req('PUT', '/api/books/' + original.id, { token: adminToken, body: edited });
  ok('Admin updates a book (PUT)', put.status === 200 && put.data.price === editedPrice, JSON.stringify(put.data));
  const after = await req('GET', '/api/books/' + original.id);
  ok('Updated book visible on public API', after.status === 200 && after.data.price === editedPrice && after.data.stock === editedStock);
  const restore = await req('PUT', '/api/books/' + original.id, { token: adminToken, body: original });
  ok('Original data restored', restore.status === 200 && restore.data.price === original.price);

  // 5. Full lifecycle: create -> read -> delete
  const temp = {
    title: 'Smoke Test Book', author: 'QA Bot', category: 'Science',
    subcategory: 'Testing', description: 'Temporary test record',
    cover: 'assets/covers/1984.jpg', price: 9.99, oldPrice: 12.99, stock: 3,
    rating: 4.2, reviews: 7, featured: false, bestseller: false, isNew: true
  };
  const created = await req('POST', '/api/books', { token: adminToken, body: temp });
  ok('Admin creates a book (POST)', created.status === 201 && created.data.id, JSON.stringify(created.data));
  const tempId = created.data && created.data.id;
  const listed = await req('GET', '/api/books');
  ok('Created book appears in public list', tempId && listed.data.some((b) => b.id === tempId));
  const got = await req('GET', '/api/books/' + tempId);
  ok('Created book readable via public API', got.status === 200 && got.data.subcategory === 'Testing' && got.data.stock === 3);
  const del = await req('DELETE', '/api/books/' + tempId, { token: adminToken });
  ok('Admin deletes the book (DELETE)', del.status === 200 && del.data.ok);
  const gone = await req('GET', '/api/books/' + tempId);
  ok('Deleted book gone from public API', gone.status === 404);

  // 6. Image upload (admin only)
  const base64Png = 'data:image/png;base64,' + Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
  ).toString('base64');
  const up = await req('POST', '/api/upload', { token: adminToken, body: { data: base64Png } });
  ok('Image upload returns a URL', up.status === 200 && /^\/uploads\/.+\.png$/.test(up.data && up.data.url), JSON.stringify(up.data));
  if (up.status === 200) {
    const img = await fetch(BASE + up.data.url);
    ok('Uploaded image is publicly served', img.status === 200);
  }
  const upNoToken = await req('POST', '/api/upload', { body: { data: base64Png } });
  ok('Upload rejected without admin token', upNoToken.status === 401);

  // 7. Role protection: a normal customer must NOT use admin functions
  const cust = await req('POST', '/api/auth/register', {
    body: { name: 'Smoke Customer', email: 'smoke' + Date.now() + '@example.com', password: 'secret123' }
  });
  ok('Customer registration works', cust.status === 201 && cust.data.user.role === 'customer');
  const custToken = cust.data.token;
  const custMe = await req('GET', '/api/auth/me', { token: custToken });
  ok('Customer session is role=customer', custMe.data.user.role === 'customer');
  const custPost = await req('POST', '/api/books', { token: custToken, body: temp });
  ok('Customer cannot create books (401)', custPost.status === 401);
  const custPut = await req('PUT', '/api/books/1', { token: custToken, body: edited });
  ok('Customer cannot edit books (401)', custPut.status === 401);
  const custDel = await req('DELETE', '/api/books/1', { token: custToken });
  ok('Customer cannot delete books (401)', custDel.status === 401);
  const anonPost = await req('POST', '/api/books', { body: temp });
  ok('Anonymous cannot create books (401)', anonPost.status === 401);

  // 8. Orders: public creation, admin-only listing
  const order = await req('POST', '/api/orders', {
    body: { customer: 'Smoke Shopper', email: 'smoke' + Date.now() + '@example.com', items: 2, total: 29.98 }
  });
  ok('Shopper places an order (POST /api/orders)', order.status === 201 && /^BH-\d+$/.test(order.data && order.data.order_ref), JSON.stringify(order.data));
  const orderRef = order.data && order.data.order_ref;
  const ordersAnon = await req('GET', '/api/orders');
  ok('Orders listing rejected without admin token', ordersAnon.status === 401);
  const ordersAdmin = await req('GET', '/api/orders', { token: adminToken });
  ok('Admin lists orders', ordersAdmin.status === 200 && Array.isArray(ordersAdmin.data) && ordersAdmin.data.length > 0);
  ok('Placed order appears in admin list', orderRef && ordersAdmin.data.some((o) => o.order_ref === orderRef));
  const badOrder = await req('POST', '/api/orders', { body: { customer: '', email: 'x@y.z', items: 0, total: -1 } });
  ok('Invalid order rejected', badOrder.status === 400);

  // 9. Logout invalidates the session
  const logout = await req('POST', '/api/auth/logout', { token: adminToken });
  ok('Logout succeeds', logout.status === 200);
  const meAfter = await req('GET', '/api/auth/me', { token: adminToken });
  ok('Token invalid after logout (admin panel closed)', meAfter.status === 401);

  // 10. Bad credentials rejected
  const bad = await req('POST', '/api/auth/login', { body: { email: ADMIN_EMAIL, password: 'wrong-password' } });
  ok('Wrong password rejected', bad.status === 401);

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });