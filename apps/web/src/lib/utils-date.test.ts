import { afterEach, describe, expect, it, vi } from 'vitest';
import { AVATAR_COLORS, formatDate, formatDateShort, todayISO } from './utils';

function whiteContrast(hex: string): number {
  const channels = hex.slice(1).match(/.{2}/g)!.map((value) => Number.parseInt(value, 16) / 255);
  const luminance = channels
    .map((value) => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4)
    .reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index], 0);
  return 1.05 / (luminance + 0.05);
}

describe('todayISO', () => {
  const originalTimezone = process.env.TZ;

  afterEach(() => {
    vi.useRealTimers();
    process.env.TZ = originalTimezone;
  });

  it('uses the browser-local calendar date across the IST midnight boundary', () => {
    process.env.TZ = 'Asia/Kolkata';
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-13T19:15:00.000Z'));

    expect(todayISO()).toBe('2026-08-14');
  });

  it('keeps every initials avatar AA-readable with white text', () => {
    for (const color of AVATAR_COLORS) expect(whiteContrast(color)).toBeGreaterThanOrEqual(4.5);
  });

  it('renders date-only values on their stated day west of UTC', () => {
    process.env.TZ = 'America/Los_Angeles';

    expect(formatDate('2026-08-14')).toMatch(/14 Aug 2026/);
    expect(formatDateShort('2026-08-14')).toMatch(/14 Aug/);
  });
});
