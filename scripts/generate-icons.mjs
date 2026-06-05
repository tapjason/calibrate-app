// Generates placeholder app icons for Calibrate.
//
// The mark is the app's core idea: a "perfect calibration" diagonal with a few
// plotted data points straddling it. Pure placeholder — swap for real art before
// store submission. Re-run with: `node scripts/generate-icons.mjs`.
//
// Outputs:
//   assets/icons/icon.png            1024  (iOS / main app icon, opaque bg)
//   assets/icons/adaptive-icon.png   1024  (Android foreground, transparent)
//   assets/icons/favicon.png           48  (web)
//   assets/images/splash-icon.png    1024  (splash logo, transparent)

import { PNG } from 'pngjs';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// Brand palette
const BG = [79, 70, 229]; // indigo-600 #4F46E5
const LINE = [255, 255, 255]; // diagonal
const DOT = [255, 255, 255]; // data points
const DOT_CORE = [79, 70, 229]; // indigo core, gives a "target" read

// Data points along the diagonal, expressed as (stated, actual) fractions of the
// plot area. They wobble above and below the line — the whole point of the app.
const POINTS = [
  [0.15, 0.22],
  [0.38, 0.3],
  [0.55, 0.6],
  [0.72, 0.66],
  [0.86, 0.88],
];

function blend(png, x, y, color, cov) {
  if (cov <= 0) return;
  const i = (png.width * y + x) << 2;
  const a = Math.min(1, cov);
  for (let c = 0; c < 3; c++) {
    png.data[i + c] = Math.round(png.data[i + c] * (1 - a) + color[c] * a);
  }
  png.data[i + 3] = Math.round(Math.min(255, png.data[i + 3] + a * 255));
}

function disc(png, cx, cy, r, color) {
  const x0 = Math.max(0, Math.floor(cx - r - 1));
  const x1 = Math.min(png.width - 1, Math.ceil(cx + r + 1));
  const y0 = Math.max(0, Math.floor(cy - r - 1));
  const y1 = Math.min(png.height - 1, Math.ceil(cy + r + 1));
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
      blend(png, x, y, color, r - d + 0.5);
    }
  }
}

function segment(png, ax, ay, bx, by, halfw, color) {
  const x0 = Math.max(0, Math.floor(Math.min(ax, bx) - halfw - 1));
  const x1 = Math.min(png.width - 1, Math.ceil(Math.max(ax, bx) + halfw + 1));
  const y0 = Math.max(0, Math.floor(Math.min(ay, by) - halfw - 1));
  const y1 = Math.min(png.height - 1, Math.ceil(Math.max(ay, by) + halfw + 1));
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy || 1;
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const px = x + 0.5 - ax;
      const py = y + 0.5 - ay;
      let t = (px * dx + py * dy) / len2;
      t = Math.max(0, Math.min(1, t));
      const d = Math.hypot(px - t * dx, py - t * dy);
      blend(png, x, y, color, halfw - d + 0.5);
    }
  }
}

function render({ size, withBg, logoScale }) {
  const png = new PNG({ width: size, height: size, fill: true });
  // Start fully transparent.
  png.data.fill(0);
  if (withBg) {
    for (let i = 0; i < png.data.length; i += 4) {
      png.data[i] = BG[0];
      png.data[i + 1] = BG[1];
      png.data[i + 2] = BG[2];
      png.data[i + 3] = 255;
    }
  }

  // Logo geometry centered in `logoScale` fraction of the canvas.
  const box = size * logoScale;
  const off = (size - box) / 2;
  const margin = 0.16 * box; // plot inset within the logo box
  const plot = box - 2 * margin;
  const px = (f) => off + margin + f * plot;
  const py = (f) => off + margin + (1 - f) * plot; // y grows upward

  segment(png, px(0), py(0), px(1), py(1), 0.05 * box, LINE);

  const r = 0.075 * box;
  for (const [sx, sy] of POINTS) {
    disc(png, px(sx), py(sy), r, DOT);
    disc(png, px(sx), py(sy), r * 0.42, DOT_CORE);
  }

  return png;
}

function write(rel, png) {
  const out = resolve(root, rel);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, PNG.sync.write(png));
  console.log('wrote', rel);
}

write('assets/icons/icon.png', render({ size: 1024, withBg: true, logoScale: 0.78 }));
write('assets/icons/adaptive-icon.png', render({ size: 1024, withBg: false, logoScale: 0.62 }));
write('assets/icons/favicon.png', render({ size: 48, withBg: true, logoScale: 0.82 }));
write('assets/images/splash-icon.png', render({ size: 1024, withBg: false, logoScale: 0.55 }));
