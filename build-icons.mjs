import sharp from "sharp";
import { readFileSync, writeFileSync } from "node:fs";

const full = readFileSync("assets/icon.svg");
const small = readFileSync("assets/icon-small.svg");

const render = (svg, size) =>
  sharp(svg).resize(size, size, { kernel: "lanczos3" }).png().toBuffer();

const layers = [
  ...[16, 20, 24, 32].map((size) => ({ size, svg: small })),
  ...[48, 64, 256].map((size) => ({ size, svg: full })),
];

const pngs = [];
for (const { size, svg } of layers) pngs.push({ size, buf: await render(svg, size) });

function buildIco(items) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(items.length, 4);
  const dir = Buffer.alloc(16 * items.length);
  let offset = 6 + dir.length;
  items.forEach(({ size, buf }, i) => {
    const o = i * 16;
    dir.writeUInt8(size >= 256 ? 0 : size, o);
    dir.writeUInt8(size >= 256 ? 0 : size, o + 1);
    dir.writeUInt16LE(1, o + 4);
    dir.writeUInt16LE(32, o + 6);
    dir.writeUInt32LE(buf.length, o + 8);
    dir.writeUInt32LE(offset, o + 12);
    offset += buf.length;
  });
  return Buffer.concat([header, dir, ...items.map((p) => p.buf)]);
}

writeFileSync("src-tauri/icons/icon.ico", buildIco(pngs));
writeFileSync("src-tauri/icons/32x32.png", pngs.find((p) => p.size === 32).buf);
