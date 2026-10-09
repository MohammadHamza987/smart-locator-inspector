#!/usr/bin/env node
/**
 * Generates the extension icons as PNG files with no third-party dependencies.
 * Design: indigo rounded square with a white target reticle.
 *   node scripts/generate-icons.mjs
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { deflateSync } from 'node:zlib';

const SIZES = [16, 32, 48, 128];
const OUT_DIR = resolve('public/icons');
const SAMPLES = 4;

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

function encodePng(size, rgba) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8; // bit depth
  header[9] = 6; // RGBA
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function insideRoundedSquare(x, y, radius) {
  const cx = Math.min(Math.max(x, radius), 1 - radius);
  const cy = Math.min(Math.max(y, radius), 1 - radius);
  return (x - cx) ** 2 + (y - cy) ** 2 <= radius ** 2;
}

/** Returns [r, g, b, a] in 0..1 for a point in unit space. */
function shade(x, y, size) {
  if (!insideRoundedSquare(x, y, 0.22)) return [0, 0, 0, 0];
  const t = (x + y) / 2;
  const background = [0.31 + 0.18 * t, 0.27 + 0.0 * t, 0.9 - 0.05 * t];
  const dx = x - 0.5;
  const dy = y - 0.5;
  const distance = Math.hypot(dx, dy);
  const stroke = size <= 16 ? 0.085 : size <= 32 ? 0.07 : 0.055;
  const ring = Math.abs(distance - 0.25) <= stroke / 2;
  const dot = distance <= (size <= 16 ? 0.09 : 0.07);
  const arm = (Math.abs(dx) <= stroke / 2 && Math.abs(dy) >= 0.12 && Math.abs(dy) <= 0.38) ||
    (Math.abs(dy) <= stroke / 2 && Math.abs(dx) >= 0.12 && Math.abs(dx) <= 0.38);
  if (ring || dot || arm) return [1, 1, 1, 1];
  return [...background, 1];
}

function render(size) {
  const pixels = Buffer.alloc(size * size * 4);
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      const sum = [0, 0, 0, 0];
      for (let sy = 0; sy < SAMPLES; sy++) {
        for (let sx = 0; sx < SAMPLES; sx++) {
          const [r, g, b, a] = shade((px + (sx + 0.5) / SAMPLES) / size, (py + (sy + 0.5) / SAMPLES) / size, size);
          sum[0] += r * a;
          sum[1] += g * a;
          sum[2] += b * a;
          sum[3] += a;
        }
      }
      const count = SAMPLES * SAMPLES;
      const alpha = sum[3] / count;
      const offset = (py * size + px) * 4;
      pixels[offset] = alpha ? Math.round((sum[0] / sum[3]) * 255) : 0;
      pixels[offset + 1] = alpha ? Math.round((sum[1] / sum[3]) * 255) : 0;
      pixels[offset + 2] = alpha ? Math.round((sum[2] / sum[3]) * 255) : 0;
      pixels[offset + 3] = Math.round(alpha * 255);
    }
  }
  return encodePng(size, pixels);
}

await mkdir(OUT_DIR, { recursive: true });
for (const size of SIZES) {
  await writeFile(resolve(OUT_DIR, `icon-${size}.png`), render(size));
}
console.log(`✓ Generated ${SIZES.length} icons in ${OUT_DIR}`);
