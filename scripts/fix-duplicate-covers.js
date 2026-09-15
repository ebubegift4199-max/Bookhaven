#!/usr/bin/env node
/* ==========================================================================
   BookHaven — Fix Duplicate Book Covers
   For every group of books sharing the same cover image:
     - The first book (lowest ID) keeps the original cover.
     - All other books get a unique SVG placeholder cover.
   After running this, use `node scripts/fetch-covers.js` to download
   real covers from Open Library where available.
   Usage: node scripts/fix-duplicate-covers.js [--dry-run]
   ========================================================================== */
'use strict';

const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

const DB_PATH = path.join(__dirname, '..', 'books.db');
const COVER_DIR = path.join(__dirname, '..', 'assets', 'covers');
const db = new DatabaseSync(DB_PATH);

const DRY_RUN = process.argv.includes('--dry-run');

/* ---------- 01. Find books with duplicate covers ---------- */
console.log('Scanning database for duplicate covers...\n');

const allBooks = db.prepare('SELECT id, title, author, category, cover FROM books ORDER BY id').all();
const coverGroups = {};
for (const b of allBooks) {
  const c = b.cover || '';
  if (!coverGroups[c]) coverGroups[c] = [];
  coverGroups[c].push(b);
}

const duplicateGroups = Object.entries(coverGroups).filter(([, books]) => books.length > 1);
const booksToFix = duplicateGroups.reduce((sum, [, books]) => sum + books.length - 1, 0);

console.log(`  Total books: ${allBooks.length}`);
console.log(`  Unique covers: ${Object.keys(coverGroups).length}`);
console.log(`  Cover groups with duplicates: ${duplicateGroups.length}`);
console.log(`  Books needing new covers: ${booksToFix}\n`);

if (DRY_RUN) {
  console.log('DRY RUN — showing first 5 groups:\n');
  for (const [cover, books] of duplicateGroups.slice(0, 5)) {
    console.log(`  ${cover} (${books.length} books):`);
    books.forEach((b, i) => console.log(`    ${i === 0 ? '[KEEP]' : '[FIX] '} ID:${b.id} "${b.title}" by ${b.author}`));
  }
  process.exit(0);
}

/* ---------- 02. SVG placeholder generator ---------- */
const CATEGORY_COLORS = {
  'Fiction':           { bg: '#1a1a2e', fg: '#e0c97f', accent: '#c9a227' },
  'Science':           { bg: '#0f3460', fg: '#e0e0e0', accent: '#53a8b6' },
  'Business':          { bg: '#1b262c', fg: '#bbe1fa', accent: '#3282b8' },
  'Technology':        { bg: '#162447', fg: '#e43f5a', accent: '#1f4068' },
  'Romance':           { bg: '#2c003e', fg: '#ff6f91', accent: '#ff9671' },
  "Children's":        { bg: '#ff6b6b', fg: '#ffffff', accent: '#feca57' },
  'History':           { bg: '#2d132c', fg: '#ee4540', accent: '#c72c41' },
  'Young Adult':       { bg: '#1b1b2f', fg: '#e43f5a', accent: '#162447' },
  'Self-Help':         { bg: '#1a1a2e', fg: '#e94560', accent: '#0f3460' },
  'Biography':         { bg: '#2c2c34', fg: '#f0c27f', accent: '#4b6cb7' },
  'Cook Books & Wine': { bg: '#3c1518', fg: '#f2e8cf', accent: '#a4161a' },
};

function generatePlaceholderSvg(book) {
  const colors = CATEGORY_COLORS[book.category] || { bg: '#1d1d24', fg: '#f6f1e4', accent: '#c9a227' };
  const initials = (book.title || 'B')
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w.charAt(0).toUpperCase())
    .join('');

  const titleLines = [];
  const words = (book.title || 'Untitled').split(/\s+/);
  let line = '';
  for (const w of words) {
    if ((line + ' ' + w).trim().length > 14) {
      titleLines.push(line.trim());
      line = w;
    } else {
      line = line ? line + ' ' + w : w;
    }
  }
  if (line.trim()) titleLines.push(line.trim());
  const titleSvg = titleLines.slice(0, 3).map((l, i) =>
    `<text x="100" y="${100 + i * 16}" font-family="Georgia,serif" font-size="13" font-weight="bold" fill="${colors.fg}" text-anchor="middle">${escapeXml(l)}</text>`
  ).join('\n    ');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="300" viewBox="0 0 200 300">
    <rect width="200" height="300" rx="10" fill="${colors.bg}"/>
    <rect x="8" y="8" width="184" height="284" rx="8" fill="none" stroke="${colors.accent}" stroke-opacity=".35" stroke-width="1.5"/>
    <rect x="70" y="20" width="60" height="3" rx="1.5" fill="${colors.accent}" opacity=".5"/>
    <text x="100" y="72" font-family="Georgia,serif" font-size="28" font-weight="bold" fill="${colors.accent}" text-anchor="middle">${escapeXml(initials)}</text>
    <line x1="40" y1="84" x2="160" y2="84" stroke="${colors.accent}" stroke-opacity=".2" stroke-width="1"/>
    ${titleSvg}
    <text x="100" y="165" font-family="Arial,sans-serif" font-size="9" fill="${colors.fg}" fill-opacity=".4" text-anchor="middle">${escapeXml(book.author || '')}</text>
    <text x="100" y="280" font-family="Arial,sans-serif" font-size="7" fill="${colors.accent}" fill-opacity=".4" text-anchor="middle">BOOKHAVEN</text>
  </svg>`;
}

function escapeXml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function slugify(s) {
  return String(s).toLowerCase()
    .replace(/[':\u2019]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

/* ---------- 03. Process all duplicates in a single transaction ---------- */
const startTime = Date.now();
let fixed = 0;

db.exec('BEGIN');
try {
  fs.mkdirSync(COVER_DIR, { recursive: true });

  for (const [cover, books] of duplicateGroups) {
    const updateStmt = db.prepare('UPDATE books SET cover = ? WHERE id = ?');

    for (let i = 1; i < books.length; i++) {
      const book = books[i];
      const slug = slugify(book.title) + '-' + book.id;
      const svgName = slug + '.svg';
      const svgPath = path.join(COVER_DIR, svgName);

      fs.writeFileSync(svgPath, generatePlaceholderSvg(book));
      const newCover = 'assets/covers/' + svgName;
      updateStmt.run(newCover, book.id);
      fixed++;
    }
  }

  db.exec('COMMIT');
} catch (err) {
  db.exec('ROLLBACK');
  throw err;
}

const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);

console.log(`Fixed ${fixed} books in ${elapsed}s\n`);

/* ---------- 04. Verify ---------- */
const afterBooks = db.prepare('SELECT id, cover FROM books').all();
const afterCovers = {};
afterBooks.forEach((b) => { afterCovers[b.cover] = (afterCovers[b.cover] || 0) + 1; });
const remainingDupes = Object.values(afterCovers).filter((n) => n > 1).length;

console.log('Verification:');
console.log(`  Total books: ${afterBooks.length}`);
console.log(`  Unique covers: ${Object.keys(afterCovers).length}`);
console.log(`  Remaining duplicate groups: ${remainingDupes}`);
console.log(`\nNext step: run "node scripts/fetch-covers.js" to download real covers from Open Library.`);
