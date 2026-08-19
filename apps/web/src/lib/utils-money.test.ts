import { describe, expect, it } from 'vitest';
import { buildUPIUri, formatMoney } from './utils';

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

describe('buildUPIUri', () => {
  it('generates a clean P2P UPI URI without merchant tr parameter', () => {
    const uri = buildUPIUri({
      receiverUpiId: 'yuvraj2107@ibl',
      receiverName: 'Yuvraj Gandhmal',
      amount: '10',
      groupName: 'VIT Flatmates',
      correlationRef: 'EXPENSO-test-uuid',
    });

    expect(uri).toBe('upi://pay?pa=yuvraj2107%40ibl&pn=Yuvraj+Gandhmal&am=10.00&cu=INR&tn=Expenso+settlement+for+VIT+Flatmates');
    expect(uri).not.toContain('tr=');
  });

  it('handles default notes when group name is not provided', () => {
    const uri = buildUPIUri({
      receiverUpiId: 'vaibhav9bansode@okicici',
      receiverName: 'Vaibhav Bansode',
      amount: '29.50',
    });

    expect(uri).toBe('upi://pay?pa=vaibhav9bansode%40okicici&pn=Vaibhav+Bansode&am=29.50&cu=INR&tn=Expenso+settlement');
    expect(uri).not.toContain('tr=');
  });
});
