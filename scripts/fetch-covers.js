/* Fetches real book covers from Open Library for all books in books.db
   and updates the cover paths to the local downloaded files.
   Tries multiple ISBNs per book; falls back to MANUAL_ISBNS. */
'use strict';
const path = require('path');
const fs = require('fs');
const { DatabaseSync } = require('node:sqlite');

const db = new DatabaseSync(path.join(__dirname, '..', 'books.db'));
const books = db.prepare('SELECT * FROM books ORDER BY id').all();

const MANUAL_ISBNS = {
  '1984': ['9780451524935', '9780141036144', '9780452262935'],
  'Pride and Prejudice': ['9780141439518', '9780141040349'],
  'The Hobbit': ['9780547928227', '9780261103344', '9780345339683'],
  'The Kite Runner': ['9781594631931', '9780747584779', '9781594630002'],
  'A Man Called Ove': ['9781476738024', '9781476738031', '9781444780015'],
  'A Brief History of Time': ['9780553380163', '9780553804368', '9780593709900'],
  'The Selfish Gene': ['9780199291151', '9780198788607', '9780192860927'],
  'The Lean Startup': ['9780307887894', '9780307887917', '9780670921607'],
  'The Pragmatic Programmer': ['9780135957059', '9780135957080', '9780201616224'],
  'The Design of Everyday Things': ['9780465050659', '9780465072996', '9780262640374'],
  'Charlotte\u0027s Web': ['9780064400558', '9780061124952', '9780060263850'],
  'Harry Potter and the Philosopher\u0027s Stone': ['9781408855652', '9781408845646', '9780590353427'],
  'The Notebook': ['9780446605236', '9780446676089', '9781455582877'],
  'It Ends with Us': ['9781471156267', '9781501110368', '9781501110375'],
  'Me Before You': ['9780670026609', '9781405909044', '9780143124513']
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchRetry(url, tries = 3) {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url);
      if (res.ok) return res;
    } catch (e) { /* retry */ }
    await sleep(2000 * (i + 1));
  }
  return null;
}

async function getIsbns(book) {
  const list = new Set();
  try {
    const q = encodeURIComponent(`title:"${book.title}" author:${book.author.split(' ')[0]}`);
    const res = await fetchRetry(`https://openlibrary.org/search.json?q=${q}&fields=isbn,title&limit=5`);
    if (res) {
      const data = await res.json();
      for (const d of (data.docs || [])) {
        for (const isbn of (d.isbn || [])) {
          const clean = String(isbn).replace(/\D/g, '');
          if (clean.length === 13 || clean.length === 10) list.add(clean);
        }
      }
    }
  } catch (e) { /* ignore */ }
  for (const isbn of (MANUAL_ISBNS[book.title] || [])) {
    const clean = String(isbn).replace(/\D/g, '');
    if (clean) list.add(clean);
  }
  return [...list].slice(0, 8);
}

async function tryDownload(isbns, slug) {
  for (const isbn of isbns) {
    const url = `https://covers.openlibrary.org/b/isbn/${isbn}-L.jpg`;
    const res = await fetchRetry(url);
    if (!res) continue;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length >= 5000) return { buf, isbn };
  }
  return null;
}

(async () => {
  let ok = 0, fail = 0;
  for (const b of books) {
    if (b.cover && !b.cover.startsWith('assets/covers/')) continue;
    if (b.cover && b.cover.endsWith('.jpg')) {
      const f = path.join(__dirname, '..', b.cover);
      if (fs.existsSync(f) && fs.statSync(f).size > 5000) continue; // already good
    }

    const slug = path.basename(b.cover || `book-${b.id}.svg`, path.extname(b.cover || '.svg'));
    const isbns = await getIsbns(b);
    const got = await tryDownload(isbns, slug);
    if (!got) {
      console.log(`STILL FAILED: ${b.title} (${isbns.length} isbns tried)`);
      fail++;
      continue;
    }
    fs.writeFileSync(path.join(__dirname, '..', 'assets', 'covers', slug + '.jpg'), got.buf);
    db.prepare('UPDATE books SET cover = ? WHERE id = ?').run(`assets/covers/${slug}.jpg`, b.id);
    console.log(`OK: ${b.title} via ${got.isbn} (${(got.buf.length / 1024).toFixed(0)}KB)`);
    ok++;
    await sleep(300);
  }
  console.log(`\nDone: ${ok} updated, ${fail} failed.`);
})();
