#!/usr/bin/env node
/* ==========================================================================
   Romance Re-tag + New Books + Cover Fetch Migration
   Usage: node scripts/migrate-romance.js
   Uses node:sqlite (node:22+) — no external dependencies.
   ========================================================================== */
'use strict';

const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

const DB_PATH = path.join(__dirname, '..', 'books.db');
const COVER_DIR = path.join(__dirname, '..', 'assets', 'covers');
const db = new DatabaseSync(DB_PATH);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const slugify = (s) =>
  s.toLowerCase()
    .replace(/['':\u2019]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

/* ======================================================================
   STEP 1 — Re-tag existing Romance subcategories
   ====================================================================== */
console.log('\n=== STEP 1: Re-tag Romance subcategories ===');

const RETAG_MAP = {
  'Romance Fiction':        'Clean',
  'Regency Romance':        'Clean',
  'Holiday Romance':        'Clean',
  'Marriage of Convenience': 'Clean',
  'New Adult Romance':      'New Adult & College',
  'Young Adult Romance':    'New Adult & College',
  'Fantasy Romance':        'Romantasy',
  'Historical Romance':     'Romantasy',
  'Erotic Romance':         'Alpha Males',
  'Sports Romance':         'Alpha Males',
  'Billionaire Romance':    'Wealthy',
  'Forbidden Romance':      'Forbidden Love',
  'Second Chance Romance':  'Second Chances',
  'LGBT Romance':           'Romantic Comedy',
  'Friends to Lovers':      'Romantic Comedy',
};

const updateStmt = db.prepare('UPDATE books SET subcategory = ? WHERE category = ? AND subcategory = ?');
let retagged = 0;
for (const [oldSub, newSub] of Object.entries(RETAG_MAP)) {
  const info = updateStmt.run(newSub, 'Romance', oldSub);
  if (info.changes) {
    console.log(`  "${oldSub}" -> "${newSub}" (${info.changes} book${info.changes > 1 ? 's' : ''})`);
    retagged += info.changes;
  }
}
console.log(`  Total re-tagged: ${retagged}`);

/* ======================================================================
   STEP 2 — Insert new Romance books
   ====================================================================== */
console.log('\n=== STEP 2: Insert new Romance books ===');

const NEW_BOOKS = [
  { title: 'Get a Life, Chloe Brown',     author: 'Talia Hibbert',              subcategory: 'Romantic Comedy', description: 'A computer nerd with a plan to live life to the fullest enlists the help of a motorcycle-riding artist to check off her bucket list.', price: 12990, oldPrice: null, rating: 4.3, reviews: 18500, featured: 0, bestseller: 0, isNew: 1 },
  { title: 'Act Your Age, Eve Brown',     author: 'Talia Hibbert',              subcategory: 'Romantic Comedy', description: 'The most chaotic Brown sister accidentally hits the hero with her car and ends up as his B&B chef -- sparks fly.', price: 13490, oldPrice: null, rating: 4.4, reviews: 14200, featured: 0, bestseller: 0, isNew: 1 },
  { title: 'The Deal',                    author: 'Elle Kennedy',               subcategory: 'Alpha Males', description: 'A campus hockey star strikes a deal with the music major who hates him: tutor him, and he will help her land the guy of her dreams.', price: 11990, oldPrice: null, rating: 4.5, reviews: 32000, featured: 0, bestseller: 1, isNew: 0 },
  { title: 'Beautifully Cruel',           author: 'J.T. Geissinger',            subcategory: 'Alpha Males', description: 'A ruthless crime boss becomes obsessed with the woman he saves from a late-night mugging -- dark, addictive, consuming.', price: 12490, oldPrice: null, rating: 4.4, reviews: 11800, featured: 0, bestseller: 0, isNew: 1 },
  { title: 'Marrying Winterborne',        author: 'Lisa Kleypas',               subcategory: 'Wealthy', description: 'A Welsh department-store tycoon claims a reluctant lady as his bride in this sumptuous Victorian romance.', price: 14990, oldPrice: null, rating: 4.5, reviews: 22000, featured: 0, bestseller: 1, isNew: 0 },
  { title: 'Devil in Winter',             author: 'Lisa Kleypas',               subcategory: 'Wealthy', description: 'The most notorious rake in London proposes a marriage of convenience to the wallflower heiress who fascinates him.', price: 13990, oldPrice: null, rating: 4.6, reviews: 25000, featured: 0, bestseller: 1, isNew: 0 },
  { title: 'Eleanor & Park',              author: 'Rainbow Rowell',             subcategory: 'Clean', description: 'Two misfit teenagers fall in love over comic books and mixtapes on the school bus in 1986 Omaha.', price: 10990, oldPrice: null, rating: 4.2, reviews: 28000, featured: 0, bestseller: 0, isNew: 0 },
  { title: "To All the Boys I've Loved Before", author: 'Jenny Han',         subcategory: 'Clean', description: "Lara Jean's secret love letters are mailed out, turning her quiet life upside down in the sweetest way.", price: 11490, oldPrice: null, rating: 4.3, reviews: 35000, featured: 0, bestseller: 1, isNew: 0 },
  { title: 'A Court of Thorns and Roses', author: 'Sarah J. Maas',             subcategory: 'Romantasy', description: 'A huntress is wrenched from her mortal world into a dangerous faerie realm of deadly politics and forbidden love.', price: 15990, oldPrice: null, rating: 4.6, reviews: 42000, featured: 0, bestseller: 1, isNew: 0 },
  { title: 'From Blood and Ash',          author: 'Jennifer L. Armentrout',     subcategory: 'Romantasy', description: 'Chosen to be the Maiden, a young woman discovers forbidden desires and a dark secret that could shatter her world.', price: 14990, oldPrice: null, rating: 4.5, reviews: 38000, featured: 0, bestseller: 1, isNew: 0 },
  { title: 'It Happened One Summer',      author: 'Tessa Bailey',               subcategory: 'Forbidden Love', description: 'A socialite banished to a small fishing town clashes with a grumpy captain who is completely off limits.', price: 12990, oldPrice: null, rating: 4.3, reviews: 19500, featured: 0, bestseller: 0, isNew: 1 },
  { title: 'The Ex Talk',                 author: 'Rachel Lynn Solomon',         subcategory: 'Second Chances', description: 'Two radio producers who are exes must pretend to still be a couple for a new show -- and realize they never stopped loving each other.', price: 11990, oldPrice: null, rating: 4.2, reviews: 12000, featured: 0, bestseller: 0, isNew: 1 },
  { title: 'Happy Place',                 author: 'Emily Henry',                subcategory: 'Contemporary Romance', description: 'A couple that broke up six months ago must keep up the act at their annual vacation with their closest friends.', price: 14990, oldPrice: null, rating: 4.4, reviews: 21000, featured: 0, bestseller: 0, isNew: 1 },
  { title: 'Credence',                    author: 'Penelope Douglas',            subcategory: 'Dark Romance', description: 'A teenager moves to a remote mountain cabin with her step-uncles in a taboo, isolating survival story of forbidden desire.', price: 13490, oldPrice: null, rating: 4.1, reviews: 16000, featured: 0, bestseller: 0, isNew: 1 },
  { title: 'Bitten',                      author: 'Kelley Armstrong',            subcategory: 'Paranormal Romance', description: "A female werewolf living among humans is dragged back into her pack's brutal politics -- and the arms of a dangerous rival.", price: 12490, oldPrice: null, rating: 4.3, reviews: 24000, featured: 0, bestseller: 0, isNew: 0 },
  { title: 'The Sweetest Thing',          author: 'Jill Shalvis',               subcategory: 'Small Town Romance', description: 'Three sisters inherit a small-town bakery, and the eldest finds love with a wounded single-dad firefighter next door.', price: 11990, oldPrice: null, rating: 4.4, reviews: 15000, featured: 0, bestseller: 0, isNew: 1 },
];

const insert = db.prepare(`
  INSERT INTO books (title, author, category, subcategory, description, cover, price, oldPrice, stock, rating, reviews, featured, bestseller, isNew)
  VALUES (?, ?, 'Romance', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

const newIds = [];
for (let i = 0; i < NEW_BOOKS.length; i++) {
  const b = NEW_BOOKS[i];
  const slug = slugify(b.title);
  const cover = 'assets/covers/' + slug + '.jpg';
  const stock = 8 + ((i * 7) % 33);
  const info = insert.run(
    b.title, b.author, b.subcategory, b.description, cover,
    b.price, b.oldPrice, stock, b.rating, b.reviews,
    b.featured, b.bestseller, b.isNew
  );
  const id = Number(info.lastInsertRowid);
  newIds.push({ id: id, slug: slug, cover: cover });
  console.log('  + [' + id + '] ' + b.title + ' (' + b.subcategory + ')');
}
console.log('  Inserted ' + NEW_BOOKS.length + ' new books (IDs ' + newIds[0].id + '-' + newIds[newIds.length - 1].id + ')');

/* ======================================================================
   STEP 3 — Fetch covers via Open Library (cover_i)
   ====================================================================== */
(async function () {
  console.log('\n=== STEP 3: Fetch covers from Open Library ===');

  var allBooks = db.prepare('SELECT id, title, author, cover FROM books ORDER BY id').all();

  var ISBN_FALLBACK = {
    "Charlotte's Web": ['9780064400558'],
    "Harry Potter and the Philosopher's Stone": ['9781408855652'],
    'The Notebook': ['9780446605236'],
    'It Ends with Us': ['9781501110368'],
    'Me Before You': ['9780670026609'],
    'Pride and Prejudice': ['9780141439518'],
    '1984': ['9780451524935'],
  };

  async function fetchRetry(url, tries) {
    tries = tries || 3;
    for (var i = 0; i < tries; i++) {
      try {
        var res = await fetch(url, { redirect: 'follow' });
        if (res.ok) return res;
      } catch (_) { /* retry */ }
      await sleep(1500 * (i + 1));
    }
    return null;
  }

  async function searchOpenLibrary(title, author) {
    try {
      var q = encodeURIComponent('title:"' + title + '" author:' + (author || '').split(' ')[0]);
      var res = await fetchRetry('https://openlibrary.org/search.json?q=' + q + '&fields=cover_i,title&limit=3', 2);
      if (!res) return null;
      var data = await res.json();
      for (var j = 0; j < (data.docs || []).length; j++) {
        if (data.docs[j].cover_i) return data.docs[j].cover_i;
      }
    } catch (_) { /* ignore */ }
    return null;
  }

  async function fetchCoverById(coverId) {
    var url = 'https://covers.openlibrary.org/b/id/' + coverId + '-L.jpg';
    var res = await fetchRetry(url, 2);
    if (!res) return null;
    var buf = Buffer.from(await res.arrayBuffer());
    return buf.length >= 5000 ? buf : null;
  }

  async function fetchCoverByISBN(isbn) {
    var url = 'https://covers.openlibrary.org/b/isbn/' + isbn + '-L.jpg';
    var res = await fetchRetry(url, 2);
    if (!res) return null;
    var buf = Buffer.from(await res.arrayBuffer());
    return buf.length >= 5000 ? buf : null;
  }

  var fetched = 0, failed = 0, skipped = 0;

  for (var k = 0; k < allBooks.length; k++) {
    var book = allBooks[k];

    if (book.cover && !book.cover.startsWith('http')) {
      var full = path.join(__dirname, '..', book.cover);
      if (fs.existsSync(full) && fs.statSync(full).size > 5000) { skipped++; continue; }
    }

    var slug;
    if (book.cover && book.cover.startsWith('assets/covers/')) {
      slug = path.basename(book.cover, path.extname(book.cover));
    } else {
      slug = slugify(book.title);
    }
    var destPath = path.join(COVER_DIR, slug + '.jpg');

    var buf = null;
    var coverId = await searchOpenLibrary(book.title, book.author);
    if (coverId) buf = await fetchCoverById(coverId);

    if (!buf) {
      var isbns = ISBN_FALLBACK[book.title] || [];
      for (var m = 0; m < isbns.length; m++) {
        buf = await fetchCoverByISBN(isbns[m]);
        if (buf) break;
      }
    }

    if (!buf) {
      console.log('  FAIL  [' + book.id + '] ' + book.title);
      failed++;
      await sleep(200);
      continue;
    }

    fs.mkdirSync(COVER_DIR, { recursive: true });
    fs.writeFileSync(destPath, buf);
    var newCover = 'assets/covers/' + slug + '.jpg';
    db.prepare('UPDATE books SET cover = ? WHERE id = ?').run(newCover, book.id);
    console.log('  OK    [' + book.id + '] ' + book.title + ' -> ' + slug + '.jpg (' + (buf.length / 1024).toFixed(0) + ' KB)');
    fetched++;
    await sleep(300);
  }

  console.log('\n  Covers: ' + fetched + ' fetched, ' + skipped + ' already good, ' + failed + ' failed');

  /* ======================================================================
     STEP 4 — Final summary
     ====================================================================== */
  console.log('\n=== Summary ===');
  var romanceSubs = db.prepare(
    'SELECT subcategory, COUNT(*) as cnt FROM books WHERE category = \'Romance\' GROUP BY subcategory ORDER BY subcategory'
  ).all();
  console.log('Romance subcategories (' + romanceSubs.length + '):');
  romanceSubs.forEach(function(s) {
    console.log('  ' + s.subcategory + ': ' + s.cnt + ' book' + (s.cnt > 1 ? 's' : ''));
  });

  var totalBooks = db.prepare('SELECT COUNT(*) as n FROM books').get().n;
  console.log('\nTotal books in DB: ' + totalBooks);
  console.log('Migration complete.\n');
})();
