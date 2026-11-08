import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';

const sentinels = (process.env.SECRET_SENTINELS ?? '').split(',').map((value) => value.trim()).filter(Boolean);
if (sentinels.length === 0) throw new Error('SECRET_SENTINELS must contain at least one sentinel.');

const roots = ['.next/static', 'public'];
const files = [];

async function collect(target) {
  const info = await stat(target);
  if (info.isDirectory()) {
    for (const entry of await readdir(target)) await collect(path.join(target, entry));
    return;
  }
  files.push(target);
}

for (const root of roots) await collect(root);

const leaks = [];
for (const file of files) {
  const contents = await readFile(file);
  for (const sentinel of sentinels) {
    if (contents.includes(Buffer.from(sentinel))) leaks.push(`${file}: ${sentinel.slice(0, 8)}…`);
  }
}

if (leaks.length > 0) throw new Error(`Server secret leaked into browser artifact:\n${leaks.join('\n')}`);
console.log(`Checked ${files.length} browser artifacts; no server secret sentinels found.`);
