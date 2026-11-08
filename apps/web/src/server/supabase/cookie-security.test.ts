import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const source = (name: string) => fs.readFileSync(path.resolve(process.cwd(), `src/server/supabase/${name}.ts`), 'utf8');

describe('Supabase session cookie boundary', () => {
  it('keeps server and refresh cookies HttpOnly', () => {
    expect(source('server')).toContain('httpOnly: true');
    expect(source('proxy')).toContain('httpOnly: true');
    expect(source('server')).toContain('{ ...options, httpOnly: true }');
    expect(source('proxy')).toContain('{ ...options, httpOnly: true }');
  });

  it('does not ship a browser Supabase session client', () => {
    expect(fs.existsSync(path.resolve(process.cwd(), 'src/lib/supabase/client.ts'))).toBe(false);
  });
});
