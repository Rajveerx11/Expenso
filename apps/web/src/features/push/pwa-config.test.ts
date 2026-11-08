import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import nextConfig from '../../../next.config';

function pngSize(path: string): { width: number; height: number } {
  const data = readFileSync(path);
  expect(data.subarray(1, 4).toString('ascii')).toBe('PNG');
  return { width: data.readUInt32BE(16), height: data.readUInt32BE(20) };
}

describe('PWA delivery configuration', () => {
  it('allows only the configured storage family and exact Google avatar host', () => {
    expect(nextConfig.images?.remotePatterns).toEqual(expect.arrayContaining([
      expect.objectContaining({ protocol: 'https', hostname: '*.supabase.co' }),
      expect.objectContaining({ protocol: 'https', hostname: 'lh3.googleusercontent.com' }),
    ]));
    expect(nextConfig.images?.remotePatterns).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ hostname: '*.googleusercontent.com' }),
    ]));
  });

  it('serves the worker as uncached JavaScript with a root scope', async () => {
    const rules = await nextConfig.headers?.();
    const worker = rules?.find((rule) => rule.source === '/sw.js');
    expect(worker?.headers).toEqual(expect.arrayContaining([
      { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
      { key: 'Content-Type', value: 'application/javascript; charset=utf-8' },
      { key: 'Service-Worker-Allowed', value: '/' },
    ]));
  });

  it('publishes installable exact-size and maskable icon metadata', () => {
    const publicDir = resolve(process.cwd(), 'public');
    const manifest = JSON.parse(readFileSync(resolve(publicDir, 'manifest.webmanifest'), 'utf8')) as {
      id: string;
      scope: string;
      icons: Array<{ src: string; sizes: string; purpose: string }>;
    };
    expect(manifest).toMatchObject({ id: '/', scope: '/' });
    expect(manifest.icons).toEqual(expect.arrayContaining([
      expect.objectContaining({ src: '/icons/icon-192.png', sizes: '192x192', purpose: 'any' }),
      expect.objectContaining({ src: '/icons/icon-512.png', sizes: '512x512', purpose: 'any' }),
      expect.objectContaining({ src: '/icons/icon-maskable-512.png', sizes: '512x512', purpose: 'maskable' }),
    ]));
    for (const icon of manifest.icons) {
      const path = resolve(publicDir, icon.src.slice(1));
      expect(existsSync(path)).toBe(true);
      const expected = Number(icon.sizes.split('x', 1)[0]);
      expect(pngSize(path)).toEqual({ width: expected, height: expected });
    }
  });
});
