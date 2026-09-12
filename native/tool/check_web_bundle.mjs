import { gzipSync } from 'node:zlib';
import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join, relative } from 'node:path';

const root = fileURLToPath(new URL('../build/web/', import.meta.url));
const baselineKiB = Number(process.env.FLUTTER_WEB_BASELINE_KIB || '0');

async function files(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const output = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) output.push(...await files(path));
    else output.push(path);
  }
  return output;
}

const paths = await files(root);
const bootstrap = paths.filter((path) => /\.(js|wasm)$/.test(path));
let total = 0;
for (const path of bootstrap) {
  const data = await readFile(path);
  const compressed = gzipSync(data);
  total += compressed.length;
}
const totalKiB = total / 1024;
console.log(`Flutter Web JS/Wasm compressed payload: ${totalKiB.toFixed(1)} KiB (${bootstrap.map((path) => relative(root, path)).join(', ')})`);
if (baselineKiB > 0 && totalKiB > baselineKiB * 1.1) {
  console.error(`Bundle grew above the 10% budget: baseline ${baselineKiB.toFixed(1)} KiB.`);
  process.exit(1);
}
