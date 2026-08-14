import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

describe('same-file upload retry wiring', () => {
  it.each([
    'src/app/(dashboard)/profile/edit/page.tsx',
    'src/app/(dashboard)/groups/[groupId]/settings/page.tsx',
  ])('clears the hidden file input after every attempt in %s', (path) => {
    expect(source(path)).toMatch(/finally\s*{\s*if \(fileInput\.current\) fileInput\.current\.value = '';/);
  });
});
