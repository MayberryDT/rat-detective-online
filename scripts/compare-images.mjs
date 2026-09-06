import { readFileSync, existsSync } from 'node:fs';
import { inflateSync } from 'node:zlib';

function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

export function decodePngRgba(buffer) {
  if (buffer[0] !== 0x89 || buffer[1] !== 0x50) throw new Error('Not a PNG');
  let offset = 8;
  const chunks = [];
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString('ascii', offset + 4, offset + 8);
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
    } else if (type === 'IDAT') {
      chunks.push(data);
    } else if (type === 'IEND') {
      break;
    }
    offset += 12 + length;
  }
  if (bitDepth !== 8 || (colorType !== 2 && colorType !== 6)) {
    throw new Error(`Unsupported PNG (bitDepth=${bitDepth} colorType=${colorType}); capture 8-bit RGB/RGBA`);
  }
  const inflated = inflateSync(Buffer.concat(chunks));
  const channels = colorType === 6 ? 4 : 3;
  const stride = width * channels;
  const rgba = Buffer.alloc(width * height * 4);
  let src = 0;
  let prev = Buffer.alloc(stride);
  for (let y = 0; y < height; y++) {
    const filter = inflated[src++];
    const row = Buffer.alloc(stride);
    inflated.copy(row, 0, src, src + stride);
    src += stride;
    for (let i = 0; i < stride; i++) {
      const left = i >= channels ? row[i - channels] : 0;
      const up = prev[i];
      const upLeft = i >= channels ? prev[i - channels] : 0;
      let value = row[i];
      if (filter === 1) value = (value + left) & 255;
      else if (filter === 2) value = (value + up) & 255;
      else if (filter === 3) value = (value + Math.floor((left + up) / 2)) & 255;
      else if (filter === 4) value = (value + paeth(left, up, upLeft)) & 255;
      else if (filter !== 0) throw new Error(`Unsupported PNG filter ${filter}`);
      row[i] = value;
    }
    for (let x = 0; x < width; x++) {
      const si = x * channels;
      const di = (y * width + x) * 4;
      rgba[di] = row[si];
      rgba[di + 1] = row[si + 1];
      rgba[di + 2] = row[si + 2];
      rgba[di + 3] = channels === 4 ? row[si + 3] : 255;
    }
    prev = row;
  }
  return { width, height, rgba };
}

export function comparePngFiles(expectedPath, actualPath, { maxMean = 2.5, maxPercent = 1.5 } = {}) {
  if (!existsSync(expectedPath)) {
    return { status: 'missing-baseline', expectedPath, actualPath };
  }
  if (!existsSync(actualPath)) {
    return { status: 'missing-actual', expectedPath, actualPath };
  }
  const expected = decodePngRgba(readFileSync(expectedPath));
  const actual = decodePngRgba(readFileSync(actualPath));
  if (expected.width !== actual.width || expected.height !== actual.height) {
    return {
      status: 'mismatch',
      reason: `size ${actual.width}x${actual.height} != ${expected.width}x${expected.height}`,
      expectedPath,
      actualPath,
    };
  }
  let total = 0;
  let changed = 0;
  const pixels = expected.width * expected.height;
  for (let i = 0; i < expected.rgba.length; i += 4) {
    const dr = Math.abs(expected.rgba[i] - actual.rgba[i]);
    const dg = Math.abs(expected.rgba[i + 1] - actual.rgba[i + 1]);
    const db = Math.abs(expected.rgba[i + 2] - actual.rgba[i + 2]);
    const da = Math.abs(expected.rgba[i + 3] - actual.rgba[i + 3]);
    const mag = (dr + dg + db + da) / 4;
    total += mag;
    if (mag > 8) changed += 1;
  }
  const mean = total / pixels;
  const percent = (changed / pixels) * 100;
  const ok = mean <= maxMean && percent <= maxPercent;
  return {
    status: ok ? 'match' : 'mismatch',
    mean,
    percent,
    maxMean,
    maxPercent,
    expectedPath,
    actualPath,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const expected = process.argv[2];
  const actual = process.argv[3];
  if (!expected || !actual) {
    console.error('Usage: node scripts/compare-images.mjs <expected.png> <actual.png>');
    process.exit(2);
  }
  const result = comparePngFiles(expected, actual);
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.status === 'match' ? 0 : 1);
}
