import { describe, expect, it } from 'vitest';
import { avatarTicketSchema, loginSchema, moneySchema, profilePatchSchema, signUpSchema } from './contracts';

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
});
