/* ==========================================================================
   BookHaven — Checkout
   Reads the cart from localStorage, renders the order summary, validates
   the form and saves the order to the backend (POST /api/orders, read by
   the admin panel). The order is also mirrored to 'bookhaven.orders' in
   localStorage so it survives an offline server; the cart is then cleared
   and a confirmation is shown.
   Loaded AFTER js/script.js (reuses store, bookById, showToast).
   ========================================================================== */
'use strict';

const $ = (sel, ctx = document) => ctx.querySelector(sel);

const ORDERS_KEY = 'bookhaven.orders';

/* ---------- 01. Order summary ---------- */
function renderCheckout() {
  const empty = $('#co-empty');
  const layout = $('#co-layout');

  const lines = store.cart
    .map((item) => ({ book: bookById(item.id), qty: item.qty }))
    .filter((l) => l.book);

  if (!lines.length) {
    if (empty) empty.hidden = false;
    if (layout) layout.hidden = true;
    return;
  }

  if (empty) empty.hidden = true;
  if (layout) layout.hidden = false;

  const subtotal = lines.reduce((s, l) => s + l.book.price * l.qty, 0);
  const shipping = shippingFor(subtotal);
  const total = subtotal + shipping;

  const summary = $('#co-summary');
  if (!summary) return;
  summary.innerHTML = `
    <h3 class="cart-summary-title">Order Summary</h3>
    <ul class="co-items">
      ${lines.map((l) => `
        <li class="co-item">
          <img src="${l.book.cover}" alt="" loading="lazy">
          <div class="co-item-info">
            <strong>${l.book.title}</strong>
            <span>${l.qty} &times; ${fmtPrice(l.book.price)}</span>
          </div>
          <span class="co-item-total">${fmtPrice(l.book.price * l.qty)}</span>
        </li>`).join('')}
    </ul>
    <div class="summary-row"><span>Subtotal</span><span>${fmtPrice(subtotal)}</span></div>
    <div class="summary-row"><span>Shipping</span><span>${shipping === 0 ? '<span class="free">Free</span>' : fmtPrice(shipping)}</span></div>
    <div class="summary-row summary-total"><span>Total</span><span>${fmtPrice(total)}</span></div>`;
}

/* ---------- 02. Card input formatting ---------- */
const cardNumber = $('#co-card-number');
if (cardNumber) {
  cardNumber.addEventListener('input', () => {
    const digits = cardNumber.value.replace(/\D/g, '').slice(0, 16);
    cardNumber.value = digits.replace(/(.{4})/g, '$1 ').trim();
  });
}

const cardExpiry = $('#co-expiry');
if (cardExpiry) {
  cardExpiry.addEventListener('input', () => {
    const digits = cardExpiry.value.replace(/\D/g, '').slice(0, 4);
    cardExpiry.value = digits.length > 2 ? digits.slice(0, 2) + ' / ' + digits.slice(2) : digits;
  });
}

const cardCvc = $('#co-cvc');
if (cardCvc) {
  cardCvc.addEventListener('input', () => {
    cardCvc.value = cardCvc.value.replace(/\D/g, '').slice(0, 4);
  });
}

/* ---------- 03. Place order ---------- */
const form = $('#co-form');
const msg = $('#co-msg');

function err(text, focus) {
  msg.textContent = text;
  msg.className = 'auth-msg err';
  focus.focus();
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();

  const email = $('#co-email').value.trim();
  const name = $('#co-name').value.trim();
  const address = $('#co-address').value.trim();
  const city = $('#co-city').value.trim();
  const zip = $('#co-zip').value.trim();
  const country = $('#co-country').value.trim();
  const cardName = $('#co-card-name').value.trim();
  const cardDigits = $('#co-card-number').value.replace(/\D/g, '');
  const expiry = $('#co-expiry').value.trim();
  const cvc = $('#co-cvc').value.trim();

  if (!/^\S+@\S+\.\S+$/.test(email)) return err('Please enter a valid email address.', $('#co-email'));
  if (!name) return err('Please enter your full name.', $('#co-name'));
  if (!address) return err('Please enter your street address.', $('#co-address'));
  if (!city) return err('Please enter your city.', $('#co-city'));
  if (!zip) return err('Please enter your ZIP / postal code.', $('#co-zip'));
  if (!country) return err('Please enter your country.', $('#co-country'));
  if (!cardName) return err('Please enter the name on the card.', $('#co-card-name'));
  if (cardDigits.length < 12) return err('Card number looks too short.', $('#co-card-number'));
  if (!/^(0[1-9]|1[0-2]) \/ \d{2}$/.test(expiry)) return err('Use the format MM / YY.', $('#co-expiry'));
  if (!/^\d{3,4}$/.test(cvc)) return err('CVC must be 3 or 4 digits.', $('#co-cvc'));

  const lines = store.cart
    .map((item) => ({ book: bookById(item.id), qty: item.qty }))
    .filter((l) => l.book);
  if (!lines.length) return err('Your cart is empty.', form);

  const subtotal = lines.reduce((s, l) => s + l.book.price * l.qty, 0);
  const shipping = shippingFor(subtotal);
  const total = subtotal + shipping;

  /* Save the order: the server is the source of truth in production so the
     admin panel sees orders from every shopper. If the API is unreachable
     (offline / server down) the order still lands in this browser's
     localStorage mirror, just like before. */
  const order = {
    customer: name,
    email,
    date: new Date().toISOString().slice(0, 10),
    items: lines.reduce((s, l) => s + l.qty, 0),
    total: Number(total.toFixed(2)),
    status: 'Processing'
  };

  let serverOrder = null;
  try {
    const res = await fetch(API_BASE + '/api/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(order)
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data && data.order_ref) serverOrder = data;
  } catch (err) { /* offline — keep going */ }

  const orders = JSON.parse(localStorage.getItem(ORDERS_KEY) || '[]');
  const savedOrder = {
    ...order,
    id: serverOrder ? serverOrder.order_ref : 'BH-' + (1046 + orders.length + 1)
  };
  orders.unshift(savedOrder);
  localStorage.setItem(ORDERS_KEY, JSON.stringify(orders));

  store.cart = [];
  saveStore();
  updateCartBadge();

  $('#co-order-number').textContent = savedOrder.id;
  $('#co-order-total').textContent = fmtPrice(savedOrder.total);
  $('#co-layout').hidden = true;
  $('#co-confirm').hidden = false;
  window.scrollTo({ top: 0, behavior: 'smooth' });
});

/* ---------- 04. Init ---------- */
document.addEventListener('books:loaded', () => renderCheckout());
renderCheckout();
