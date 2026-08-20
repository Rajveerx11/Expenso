import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';

const tracked = execFileSync('git', ['ls-files', '-z'], {
  cwd: new URL('../../..', import.meta.url),
  encoding: 'utf8',
}).split('\0').filter(Boolean);

const secretPatterns = [
  /eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/g,
  /sb_secret_[A-Za-z0-9_-]{20,}/g,
];
const leaks = [];

for (const relativePath of tracked) {
  let contents;
  try {
    contents = await readFile(new URL(`../../../${relativePath}`, import.meta.url), 'utf8');
  } catch {
    continue;
  }
  if (secretPatterns.some((pattern) => (pattern.lastIndex = 0, pattern.test(contents)))) leaks.push(relativePath);
}

if (leaks.length > 0) throw new Error(`Possible committed secrets found in:\n${leaks.join('\n')}`);
console.log(`Checked ${tracked.length} tracked files; no JWT or Supabase secret keys found.`);
