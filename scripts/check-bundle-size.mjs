import { readFile } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import path from 'node:path';

const distDir = path.resolve('dist');
const html = await readFile(path.join(distDir, 'index.html'), 'utf8');
const entryAndPreloads = [...html.matchAll(/(?:src|href)="(\/assets\/[^\"]+\.js)"/g)].map((m) => m[1]);
const files = [...new Set(entryAndPreloads)];
let total = 0;
for (const asset of files) {
  const source = await readFile(path.join(distDir, asset.slice(1)));
  total += gzipSync(source).length;
}

const limit = 300 * 1024;
console.log(`Initial JavaScript budget: ${(total / 1024).toFixed(1)} KiB gzip / ${(limit / 1024).toFixed(0)} KiB limit`);
if (total > limit) {
  console.error(`Initial JavaScript exceeds the budget by ${((total - limit) / 1024).toFixed(1)} KiB.`);
  process.exit(1);
}
