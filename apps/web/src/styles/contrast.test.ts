import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const css = readFileSync(resolve(process.cwd(), 'src/styles/globals.css'), 'utf8');

function luminance(hex: string) {
  const channels = hex.slice(1).match(/.{2}/g)!.map((value) => {
    const channel = Number.parseInt(value, 16) / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return (0.2126 * channels[0]) + (0.7152 * channels[1]) + (0.0722 * channels[2]);
}

function contrast(first: string, second: string) {
  const [lighter, darker] = [luminance(first), luminance(second)].sort((a, b) => b - a);
  return (lighter + 0.05) / (darker + 0.05);
}

describe('small-text color contrast', () => {
  it('keeps positive balance chips at WCAG AA contrast', () => {
    const foreground = css.match(/--color-green:\s*(#[0-9A-Fa-f]{6})/)?.[1];
    const background = css.match(/--color-green-soft:\s*(#[0-9A-Fa-f]{6})/)?.[1];

    expect(css).toMatch(/\.chip-positive\s*{[\s\S]*?color:\s*var\(--color-green\)/);
    expect(contrast(foreground!, background!)).toBeGreaterThanOrEqual(4.5);
  });

  it('keeps both danger-gradient stops readable under white button text', () => {
    const stops = css.match(/\.btn-danger\s*{[\s\S]*?linear-gradient\([^,]+,\s*(#[0-9A-Fa-f]{6}),\s*(#[0-9A-Fa-f]{6})\)/);

    expect(stops).toBeTruthy();
    expect(contrast('#FFFFFF', stops![1])).toBeGreaterThanOrEqual(4.5);
    expect(contrast('#FFFFFF', stops![2])).toBeGreaterThanOrEqual(4.5);
  });
});
