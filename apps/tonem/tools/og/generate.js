// Rasterize the tonem brand assets (OG card + favicon) to PNG/ICO.
// Runs inside a node container with `sharp` available (see README in this dir).
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const SRC = __dirname;
const OUT = path.resolve(__dirname, '../../public');

// Wrap a PNG buffer into a minimal .ico (PNG-embedded, Vista+ / all modern browsers).
function pngToIco(png, size) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(1, 4); // count: 1
  const entry = Buffer.alloc(16);
  entry.writeUInt8(size === 256 ? 0 : size, 0); // width
  entry.writeUInt8(size === 256 ? 0 : size, 1); // height
  entry.writeUInt8(0, 2); // colors
  entry.writeUInt8(0, 3); // reserved
  entry.writeUInt16LE(1, 4); // planes
  entry.writeUInt16LE(32, 6); // bpp
  entry.writeUInt32LE(png.length, 8); // data size
  entry.writeUInt32LE(22, 12); // offset (6 header + 16 entry)
  return Buffer.concat([header, entry, png]);
}

async function main() {
  // OG card -> og-card.png (1200x630)
  await sharp(path.join(SRC, 'og-card.svg'), { density: 96 })
    .resize(1200, 630)
    .png({ compressionLevel: 9 })
    .toFile(path.join(OUT, 'og-card.png'));
  console.log('og-card.png written');

  // favicon.svg -> favicon.png (180) + favicon.ico (32) + apple-touch-icon (180)
  const svg = fs.readFileSync(path.join(SRC, 'favicon.svg'));
  const png32 = await sharp(svg, { density: 384 }).resize(32, 32).png().toBuffer();
  fs.writeFileSync(path.join(OUT, 'favicon.ico'), pngToIco(png32, 32));
  console.log('favicon.ico written (32px PNG-embedded)');

  await sharp(svg, { density: 384 }).resize(180, 180).png().toFile(path.join(OUT, 'apple-touch-icon.png'));
  console.log('apple-touch-icon.png written');

  // also copy the crisp SVG favicon for modern browsers
  fs.copyFileSync(path.join(SRC, 'favicon.svg'), path.join(OUT, 'favicon.svg'));
  console.log('favicon.svg copied');
}

main().catch((e) => { console.error(e); process.exit(1); });
