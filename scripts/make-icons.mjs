/**
 * Generates the PWA icons as real PNGs.
 *
 * Chrome will not offer to install a site unless the manifest carries raster
 * icons at 192 and 512 px, and installing is what reliably earns persistent
 * storage -- the thing that stops the browser quietly deleting the pantry.
 *
 * Written with only Node built-ins (zlib for the deflate, everything else by
 * hand) so the project does not gain an image-processing dependency for four
 * files that change approximately never.
 *
 * Run with: node scripts/make-icons.mjs
 */

import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';

/* -------------------------------------------------------------------------- */
/* Minimal PNG encoder                                                         */
/* -------------------------------------------------------------------------- */

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const typeBuf = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])));
  return Buffer.concat([len, typeBuf, data, crc]);
}

/** `pixels` is RGBA, 4 bytes per pixel, row-major. */
function encodePng(width, height, pixels) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type: RGBA
  ihdr[10] = 0; // deflate
  ihdr[11] = 0; // adaptive filtering
  ihdr[12] = 0; // no interlace

  // Each scanline is prefixed with its filter byte; 0 means "none".
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
    pixels.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/* -------------------------------------------------------------------------- */
/* Drawing                                                                     */
/* -------------------------------------------------------------------------- */

const rgb = (hex) => [
  parseInt(hex.slice(1, 3), 16),
  parseInt(hex.slice(3, 5), 16),
  parseInt(hex.slice(5, 7), 16),
];

const BRAND = rgb('#3f6212');
const PAPER = rgb('#f7fee7');
const DOTS = [rgb('#65a30d'), rgb('#eab308'), rgb('#dc2626')];

/** Signed distance to a rounded rectangle; negative means inside. */
function roundedRectSD(px, py, cx, cy, halfW, halfH, r) {
  const qx = Math.abs(px - cx) - (halfW - r);
  const qy = Math.abs(py - cy) - (halfH - r);
  const outside = Math.hypot(Math.max(qx, 0), Math.max(qy, 0));
  return outside + Math.min(Math.max(qx, qy), 0) - r;
}

/**
 * Renders the shelf mark. `padding` insets the artwork, which maskable icons
 * need so the safe zone is not clipped by the launcher's mask.
 */
function draw(size, { maskable = false } = {}) {
  const px = Buffer.alloc(size * size * 4);
  const inset = maskable ? size * 0.1 : 0;
  const s = size - inset * 2;
  const u = s / 64; // the original artwork was drawn on a 64px grid
  const ox = inset;
  const oy = inset;

  // Antialiasing: sample the shape's distance field and blend over 1px.
  const cover = (d) => Math.min(1, Math.max(0, 0.5 - d));

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const gx = (x + 0.5 - ox) / u;
      const gy = (y + 0.5 - oy) / u;

      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;

      const put = (c, alpha) => {
        if (alpha <= 0) return;
        r = c[0] * alpha + r * (1 - alpha);
        g = c[1] * alpha + g * (1 - alpha);
        b = c[2] * alpha + b * (1 - alpha);
        a = alpha + a * (1 - alpha);
      };

      // Body: rounded square filling the grid.
      put(BRAND, cover(roundedRectSD(gx, gy, 32, 32, 32, 32, maskable ? 32 : 14)));

      // Cupboard face.
      put(PAPER, cover(roundedRectSD(gx, gy, 32, 34, 16, 18, 4)));

      // Two shelves.
      for (const sy of [30, 40]) {
        put(BRAND, cover(Math.abs(gy - sy) - 1.5));
      }

      // Three jars, colour-coded like the stock states.
      DOTS.forEach((c, i) => {
        put(c, cover(Math.hypot(gx - 24, gy - (24 + i * 10.5)) - 3));
      });

      const o = (y * size + x) * 4;
      px[o] = Math.round(r);
      px[o + 1] = Math.round(g);
      px[o + 2] = Math.round(b);
      px[o + 3] = Math.round(a * 255);
    }
  }

  return encodePng(size, size, px);
}

/* -------------------------------------------------------------------------- */

const outDir = fileURLToPath(new URL('../public/', import.meta.url));
mkdirSync(outDir, { recursive: true });

const targets = [
  ['icon-192.png', 192, {}],
  ['icon-512.png', 512, {}],
  ['icon-maskable-192.png', 192, { maskable: true }],
  ['icon-maskable-512.png', 512, { maskable: true }],
  ['apple-touch-icon.png', 180, { maskable: true }],
];

for (const [name, size, opts] of targets) {
  const png = draw(size, opts);
  writeFileSync(outDir + name, png);
  console.log(`${name}  ${size}x${size}  ${(png.length / 1024).toFixed(1)} KB`);
}
