/* ==========================================================================
   BookHaven — generate favicon.ico (project root)
   Rasterizes assets/images/logo.svg into a PNG and wraps it in an ICO file
   so the browser's implicit GET /favicon.ico stops 404ing. Pure Node
   (node:zlib + a tiny PNG/ICO encoder), no dependencies.

   Run:  node scripts/generate-favicon.js
   Output: favicon.ico at the project root (served by Express and static hosts).
   ========================================================================== */
'use strict';

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const LOGO = path.join(__dirname, '..', 'assets', 'images', 'logo.svg');
const OUT = path.join(__dirname, '..', 'favicon.ico');

/* Render the logo programmatically (see assets/images/logo.svg). All shapes
   are expressed in the SVG's 64x64 coordinate space. */
const SHAPES = [
  /* book spine (gold) */
  { kind: 'rrect', x: 29, y: 36, w: 6, h: 16, r: 2, fill: [212, 175, 55] },            /* #d4af37 */
  /* bottom triangle */
  { kind: 'poly', pts: [[32, 46], [26, 54], [38, 54]], fill: [184, 145, 46] },        /* #b8912e */
  /* left page */
  { kind: 'poly', pts: [[32, 28], [10, 20], [10, 30], [32, 38]], fill: [232, 201, 94] }, /* #e8c95e */
  /* right page */
  { kind: 'poly', pts: [[32, 28], [54, 20], [54, 30], [32, 38]], fill: [184, 145, 46] }, /* #b8912e */
  /* top diamond */
  { kind: 'poly', pts: [[32, 12], [54, 20], [32, 28], [10, 20]], fill: [212, 175, 55] }  /* #d4af37 */
];

function insidePoly(px, py, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const xi = pts[i][0], yi = pts[i][1];
    const xj = pts[j][0], yj = pts[j][1];
    if (((yi > py) !== (yj > py)) && (px < ((xj - xi) * (py - yi)) / (yj - yi) + xi)) {
      inside = !inside;
    }
  }
  return inside;
}

function insideRoundedRect(px, py, x, y, w, h, r) {
  if (px < x || px > x + w || py < y || py > y + h) return false;
  const cx = Math.min(Math.max(px, x + r), x + w - r);
  const cy = Math.min(Math.max(py, y + r), y + h - r);
  const dx = px - cx, dy = py - cy;
  return dx * dx + dy * dy <= r * r;
}

/* Sample a point in 64x64 logo space -> RGBA color or null (transparent). */
function sample(px, py) {
  if (!insideRoundedRect(px, py, 0, 0, 64, 64, 14)) return null; /* outside the bg tile */
  /* Dark rounded-rect background, then the gold shapes drawn on top. */
  let color = [13, 13, 13]; /* #0d0d0d */
  for (const s of SHAPES) {
    const hit = s.kind === 'poly' ? insidePoly(px, py, s.pts) : insideRoundedRect(px, py, s.x, s.y, s.w, s.h, s.r);
    if (hit) { color = s.fill; break; }
  }
  return color;
}

/* Rasterize at SIZE x SIZE with SUPERSAMPLE^2 sub-pixels per output pixel. */
function rasterize(size) {
  const SUPERSAMPLE = 4;
  const buf = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0, a = 0, cov = 0;
      for (let sy = 0; sy < SUPERSAMPLE; sy++) {
        for (let sx = 0; sx < SUPERSAMPLE; sx++) {
          const px = (x * SUPERSAMPLE + sx + 0.5) * (64 / (size * SUPERSAMPLE));
          const py = (y * SUPERSAMPLE + sy + 0.5) * (64 / (size * SUPERSAMPLE));
          const c = sample(px, py);
          if (!c) continue;
          r += c[0]; g += c[1]; b += c[2]; a += 255; cov += 1;
        }
      }
      const i = (y * size + x) * 4;
      if (cov) {
        buf[i] = Math.round(r / cov);
        buf[i + 1] = Math.round(g / cov);
        buf[i + 2] = Math.round(b / cov);
        buf[i + 3] = Math.round(a / cov);
      }
      /* fully transparent pixels stay 0 */
    }
  }
  return buf;
}

/* ---------- Minimal PNG encoder (RGBA, 8-bit) ---------- */
const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? (0xedb88320 ^ (c >>> 1)) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

function toPng(size, pixels) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;   /* bit depth */
  ihdr[9] = 6;   /* color type RGBA */
  /* 10-12: compression/filter/interlace = 0 */

  /* Raw scanlines, filter byte 0 + RGBA row. */
  const stride = size * 4;
  const raw = Buffer.alloc((stride + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (stride + 1)] = 0;
    pixels.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });

  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

/* ---------- ICO wrapper (single PNG image, 32 BPP) ---------- */
function toIco(png, size) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);  /* reserved */
  header.writeUInt16LE(1, 2);  /* type: icon */
  header.writeUInt16LE(1, 4);  /* image count */

  const entry = Buffer.alloc(16);
  entry[0] = size === 256 ? 0 : size;
  entry[1] = size === 256 ? 0 : size;
  entry[2] = 0;   /* palette colors */
  entry[3] = 0;   /* reserved */
  entry.writeUInt16LE(1, 4);   /* color planes */
  entry.writeUInt16LE(32, 6);  /* bits per pixel */
  entry.writeUInt32LE(png.length, 8);
  entry.writeUInt32LE(22, 12); /* data offset */

  return Buffer.concat([header, entry, png]);
}

const SIZE = 64; /* good balance: crisp tabs, widely compatible */
const png = toPng(SIZE, rasterize(SIZE));
const ico = toIco(png, SIZE);

fs.writeFileSync(OUT, ico);
console.log(`Wrote ${OUT} (${ico.length} bytes).`);