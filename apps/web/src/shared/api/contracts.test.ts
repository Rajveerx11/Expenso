import { describe, expect, it } from 'vitest';
import {
  avatarTicketSchema,
  groupExpenseCreateSchema,
  loginSchema,
  moneySchema,
  personalTransactionCreateSchema,
  personalTransactionPatchSchema,
  profilePatchSchema,
  settlementCreateSchema,
  signUpSchema,
  webPushSubscriptionSchema,
} from './contracts';

describe('shared API contracts', () => {
  it('accepts canonical money and rejects ambiguous amounts', () => {
    expect(moneySchema.safeParse('1200.00').success).toBe(true);
    expect(moneySchema.safeParse('12.1').success).toBe(false);
    expect(moneySchema.safeParse('-1.00').success).toBe(false);
    expect(moneySchema.safeParse(12).success).toBe(false);
  });

  it('requires a useful profile patch and validates UPI format', () => {
    expect(profilePatchSchema.safeParse({ fullName: ' Demo User ' }).data).toEqual({ fullName: 'Demo User' });
    expect(profilePatchSchema.safeParse({ upiId: null }).success).toBe(true);
    expect(profilePatchSchema.safeParse({}).success).toBe(false);
    expect(profilePatchSchema.safeParse({ upiId: 'not-a-vpa' }).success).toBe(false);
    expect(profilePatchSchema.safeParse({ email: 'change@example.com' }).success).toBe(false);
  });

  it('normalizes auth email and requires an eight-character signup password', () => {
    const result = signUpSchema.safeParse({
      fullName: 'Demo User',
      email: ' Demo.User@Example.COM ',
      password: 'correct-horse',
    });
    expect(result.success && result.data.email).toBe('demo.user@example.com');
    expect(signUpSchema.safeParse({ fullName: 'D', email: 'd@example.com', password: 'short' }).success).toBe(false);
    expect(loginSchema.safeParse({ email: 'd@example.com', password: '' }).success).toBe(false);
  });

  it('enforces direct avatar upload limits', () => {
    expect(avatarTicketSchema.safeParse({ contentType: 'image/webp', sizeBytes: 1024 }).success).toBe(true);
    expect(avatarTicketSchema.safeParse({ contentType: 'image/svg+xml', sizeBytes: 1024 }).success).toBe(false);
    expect(avatarTicketSchema.safeParse({ contentType: 'image/png', sizeBytes: 5 * 1024 * 1024 + 1 }).success).toBe(false);
  });

  it('normalizes personal money strings and rejects unknown or empty patches', () => {
    expect(personalTransactionCreateSchema.parse({
      title: ' Lunch ',
      amount: '12.5',
      category: 'Food',
      type: 'expense',
      expenseDate: '2026-08-14',
    })).toMatchObject({ title: 'Lunch', amount: '12.50' });
    expect(personalTransactionCreateSchema.safeParse({
      title: 'Bad', amount: '0', category: 'Unknown', type: 'expense', expenseDate: '2026-08-14',
    }).success).toBe(false);
    expect(personalTransactionPatchSchema.safeParse({}).success).toBe(false);
    expect(personalTransactionPatchSchema.safeParse({ amount: '1.001' }).success).toBe(false);
  });

  it('accepts only the fields required by each shared-expense split mode', () => {
    const base = {
      paidBy: '00000000-0000-4000-8000-000000000001',
      title: 'Dinner',
      totalAmount: '100',
      category: 'Food' as const,
      expenseDate: '2026-08-14',
    };
    expect(groupExpenseCreateSchema.parse({
      ...base,
      splitType: 'equal',
      splits: [{ userId: base.paidBy, owedAmount: '99.99' }],
    })).toMatchObject({ totalAmount: '100.00', splits: [{ owedAmount: '99.99' }] });
    expect(groupExpenseCreateSchema.parse({
      ...base,
      splitType: 'percentage',
      splits: [{ userId: base.paidBy, percentage: '100', owedAmount: '0.00' }],
    })).toMatchObject({ splits: [{ percentage: '100.0000', owedAmount: '0.00' }] });
    expect(groupExpenseCreateSchema.parse({
      ...base,
      splitType: 'equal',
      splits: [{ userId: base.paidBy, owedAmount: '0' }],
    })).toMatchObject({ splits: [{ owedAmount: '0.00' }] });
    expect(groupExpenseCreateSchema.safeParse({
      ...base,
      splitType: 'exact',
      splits: [{ userId: base.paidBy, percentage: '100' }],
    }).success).toBe(false);
    expect(groupExpenseCreateSchema.safeParse({
      ...base,
      splitType: 'shares',
      splits: [{ userId: base.paidBy }],
    }).success).toBe(false);
    expect(groupExpenseCreateSchema.safeParse({
      ...base,
      totalAmount: '0.00',
      splitType: 'equal',
      splits: [{ userId: base.paidBy }],
    }).success).toBe(false);
    expect(groupExpenseCreateSchema.safeParse({
      ...base,
      splitType: 'percentage',
      splits: [{ userId: base.paidBy, percentage: '0.0000' }],
    }).success).toBe(false);
  });

  it('normalizes settlement money and bounds the optional reference', () => {
    expect(settlementCreateSchema.parse({
      receiverId: '00000000-0000-4000-8000-000000000001',
      amount: '5',
      transactionRef: ' UPI-123 ',
    })).toEqual({
      receiverId: '00000000-0000-4000-8000-000000000001',
      amount: '5.00',
      transactionRef: 'UPI-123',
    });
    expect(settlementCreateSchema.safeParse({
      receiverId: '00000000-0000-4000-8000-000000000001', amount: '0.00',
    }).success).toBe(false);
    expect(settlementCreateSchema.safeParse({
      receiverId: '00000000-0000-4000-8000-000000000001', amount: '1.001',
    }).success).toBe(false);
    expect(settlementCreateSchema.safeParse({
      receiverId: '00000000-0000-4000-8000-000000000001',
      amount: '1.00', transactionRef: 'x'.repeat(201),
    }).success).toBe(false);
  });

  it('accepts reviewed Web Push services and rejects SSRF/foreign-owner fields', () => {
    const input = {
      endpoint: 'https://fcm.googleapis.com/fcm/send/browser-token',
      expirationTime: null,
      keys: { p256dh: 'A'.repeat(65), auth: 'B'.repeat(22) },
      userAgent: 'Test Browser',
    };
    expect(webPushSubscriptionSchema.safeParse(input).success).toBe(true);
    expect(webPushSubscriptionSchema.safeParse({ ...input, endpoint: 'https://127.0.0.1/push' }).success).toBe(false);
    expect(webPushSubscriptionSchema.safeParse({ ...input, endpoint: 'https://attacker.example/push' }).success).toBe(false);
    expect(webPushSubscriptionSchema.safeParse({ ...input, endpoint: 'https://fcm.googleapis.com:444/push' }).success).toBe(false);
    expect(webPushSubscriptionSchema.safeParse({ ...input, endpoint: 'https://user@fcm.googleapis.com/push' }).success).toBe(false);
    expect(webPushSubscriptionSchema.safeParse({ ...input, endpoint: 'http://fcm.googleapis.com/push' }).success).toBe(false);
    expect(webPushSubscriptionSchema.safeParse({ ...input, keys: { ...input.keys, p256dh: 'A'.repeat(42) } }).success).toBe(false);
    expect(webPushSubscriptionSchema.safeParse({ ...input, expirationTime: 1 }).success).toBe(false);
    expect(webPushSubscriptionSchema.safeParse({ ...input, expirationTime: Number.MAX_SAFE_INTEGER }).success).toBe(false);
    expect(webPushSubscriptionSchema.safeParse({ ...input, userId: '00000000-0000-4000-8000-000000000001' }).success).toBe(false);
  });
});
