import { describe, expect, it } from 'vitest';
import { formatMoney } from './utils';

describe('formatMoney compact output', () => {
  it.each([
    [0, '₹0'],
    [12.3, '₹12.3'],
    [1_250, '₹1.3K'],
    [125_000, '₹1.3L'],
    [12_500_000, '₹1.3Cr'],
  ])('formats %s deterministically as %s', (amount, expected) => {
    expect(formatMoney(amount, true)).toBe(expected);
  });

  it('uses absolute values just like the full currency formatter', () => {
    expect(formatMoney('-1250', true)).toBe('₹1.3K');
  });
});
