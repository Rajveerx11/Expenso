import { describe, expect, it } from 'vitest';
import { buildUPIUri, createUPITransactionRef, formatMoney } from './utils';

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
  it('generates an encoded UPI URI with a unique transaction reference', () => {
    const uri = buildUPIUri({
      receiverUpiId: 'yuvraj2107@ibl',
      receiverName: 'Yuvraj Gandhmal',
      amount: '10',
      groupName: 'VIT Flatmates',
      correlationRef: '1234ABCD',
    });

    expect(uri).toBe('upi://pay?pa=yuvraj2107%40ibl&pn=Yuvraj+Gandhmal&am=10.00&cu=INR&tr=1234ABCD&tn=Expenso+settlement+for+VIT+Flatmates');
  });

  it('handles default notes when group name is not provided', () => {
    const uri = buildUPIUri({
      receiverUpiId: 'vaibhav9bansode@okicici',
      receiverName: 'Vaibhav Bansode',
      amount: '29.50',
      correlationRef: 'ABC123',
    });

    expect(uri).toBe('upi://pay?pa=vaibhav9bansode%40okicici&pn=Vaibhav+Bansode&am=29.50&cu=INR&tr=ABC123&tn=Expenso+settlement');
  });

  it('creates a 32-character alphanumeric transaction reference', () => {
    expect(createUPITransactionRef()).toMatch(/^[A-Za-z0-9]{32}$/);
  });

  it('rejects missing, overlong, or punctuation-bearing references', () => {
    const base = { receiverUpiId: 'receiver@upi', receiverName: 'Receiver', amount: '50' };
    expect(() => buildUPIUri({ ...base, correlationRef: '' })).toThrow(/1-35/);
    expect(() => buildUPIUri({ ...base, correlationRef: 'A'.repeat(36) })).toThrow(/1-35/);
    expect(() => buildUPIUri({ ...base, correlationRef: 'EXPENSO-123' })).toThrow(/1-35/);
  });
});
