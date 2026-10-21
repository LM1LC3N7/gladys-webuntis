// Generates cover.png (800x534) for gladys-webuntis: plain Node, no dependency.
// A weekly timetable board (one lesson cancelled in red, one changed in orange,
// an exam in blue) and a clock, on an indigo gradient (no brand logo).
// Usage: node scripts/cover.mjs cover.png
import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const W = 800;
const H = 534;
const px = Buffer.alloc(W * H * 3);
const set = (x, y, [r, g, b], a = 1) => {
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  const i = (y * W + x) * 3;
  px[i] = px[i] * (1 - a) + r * a;
  px[i + 1] = px[i + 1] * (1 - a) + g * a;
  px[i + 2] = px[i + 2] * (1 - a) + b * a;
};
for (let y = 0; y < H; y += 1) {
  for (let x = 0; x < W; x += 1) {
    const t = (x / W + y / H) / 2;
    set(x, y, [40 + 30 * t, 50 + 40 * t, 120 + 60 * t]);
  }
}
const white = [255, 255, 255];
const grey = [214, 220, 236];
const dark = [30, 36, 80];
const red = [235, 90, 90];
const orange = [245, 170, 70];
const blue = [90, 160, 240];
const green = [110, 205, 150];
const disc = (cx, cy, r, color, alpha = 1) => {
  for (let y = Math.floor(cy - r - 1); y <= cy + r + 1; y += 1) {
    for (let x = Math.floor(cx - r - 1); x <= cx + r + 1; x += 1) {
      const a = Math.max(0, Math.min(1, r - Math.hypot(x - cx, y - cy) + 0.5));
      if (a > 0) set(x, y, color, a * alpha);
    }
  }
};
const box = (x0, y0, x1, y1, r, color, alpha = 1) => {
  for (let y = y0; y < y1; y += 1) {
    for (let x = x0; x < x1; x += 1) {
      const cx = Math.min(Math.max(x, x0 + r), x1 - r);
      const cy = Math.min(Math.max(y, y0 + r), y1 - r);
      const a = Math.max(0, Math.min(1, r - Math.hypot(x - cx, y - cy) + 0.5));
      if (a > 0) set(x, y, color, a * alpha);
    }
  }
};
const line = (x0, y0, x1, y1, width, color) => {
  const minX = Math.floor(Math.min(x0, x1) - width);
  const maxX = Math.ceil(Math.max(x0, x1) + width);
  const minY = Math.floor(Math.min(y0, y1) - width);
  const maxY = Math.ceil(Math.max(y0, y1) + width);
  const len2 = (x1 - x0) ** 2 + (y1 - y0) ** 2 || 1;
  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      const t = Math.max(0, Math.min(1, ((x - x0) * (x1 - x0) + (y - y0) * (y1 - y0)) / len2));
      const d = Math.hypot(x - (x0 + t * (x1 - x0)), y - (y0 + t * (y1 - y0)));
      const a = Math.max(0, Math.min(1, width / 2 - d + 0.5));
      if (a > 0) set(x, y, color, a);
    }
  }
};

// Soft halo.
disc(360, 270, 260, white, 0.06);

// The board: a header row and five day columns of five lessons.
box(90, 80, 560, 460, 24, white);
box(90, 80, 560, 130, 24, dark);
box(90, 110, 560, 130, 0, dark);
for (let d = 0; d < 5; d += 1) {
  disc(140 + d * 90, 105, 8, white);
}
const special = {
  '1,1': red,
  '3,2': orange,
  '2,3': blue,
};
for (let d = 0; d < 5; d += 1) {
  for (let l = 0; l < 5; l += 1) {
    const x0 = 105 + d * 90;
    const y0 = 145 + l * 61;
    const color = special[`${d},${l}`] ?? grey;
    box(x0, y0, x0 + 75, y0 + 50, 10, color);
    if (color === red) {
      line(x0 + 18, y0 + 12, x0 + 57, y0 + 38, 7, white);
      line(x0 + 57, y0 + 12, x0 + 18, y0 + 38, 7, white);
    }
    if (color === orange) {
      line(x0 + 20, y0 + 25, x0 + 55, y0 + 25, 7, white);
      line(x0 + 43, y0 + 14, x0 + 55, y0 + 25, 7, white);
      line(x0 + 43, y0 + 36, x0 + 55, y0 + 25, 7, white);
    }
    if (color === blue) {
      line(x0 + 25, y0 + 38, x0 + 50, y0 + 13, 7, white);
      disc(x0 + 23, y0 + 40, 4, white);
    }
  }
}

// The clock of the school day start.
disc(660, 200, 92, white);
disc(660, 200, 78, dark);
for (let h = 0; h < 12; h += 1) {
  const a = (h / 12) * Math.PI * 2;
  disc(660 + Math.cos(a) * 64, 200 + Math.sin(a) * 64, h % 3 === 0 ? 6 : 3, white);
}
line(660, 200, 660, 148, 9, white);
line(660, 200, 698, 222, 9, green);
disc(660, 200, 9, white);

// A bell under the clock.
disc(660, 370, 56, white);
box(604, 370, 716, 420, 8, white);
box(590, 412, 730, 430, 8, white);
disc(660, 446, 14, white);

// PNG encoding.
const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const c = Buffer.alloc(4);
  c.writeUInt32BE(crc(td));
  return Buffer.concat([len, td, c]);
};
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(W, 0);
ihdr.writeUInt32BE(H, 4);
ihdr[8] = 8;
ihdr[9] = 2;
const raw = Buffer.alloc((W * 3 + 1) * H);
for (let y = 0; y < H; y += 1) {
  raw[y * (W * 3 + 1)] = 0;
  px.copy(raw, y * (W * 3 + 1) + 1, y * W * 3, (y + 1) * W * 3);
}
const png = Buffer.concat([
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  chunk('IHDR', ihdr),
  chunk('IDAT', deflateSync(raw, { level: 9 })),
  chunk('IEND', Buffer.alloc(0)),
]);
writeFileSync(process.argv[2] ?? 'cover.png', png);
console.log('cover', png.length, 'bytes');
