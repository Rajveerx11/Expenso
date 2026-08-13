import { z } from 'zod';

export const API_ERROR_CODES = [
  'AUTH_REQUIRED',
  'FORBIDDEN',
  'NOT_FOUND',
  'VALIDATION_ERROR',
  'CONFLICT',
  'MEMBER_ALREADY_EXISTS',
  'REGISTERED_USER_NOT_FOUND',
  'UNRESOLVED_MEMBER_DEBT',
  'GROUP_HISTORY_RETAINED',
  'PENDING_SETTLEMENT_EXISTS',
  'SETTLEMENT_EXCEEDS_BALANCE',
  'SETTLEMENT_CHANGED',
  'LINKED_TRANSACTION_READ_ONLY',
  'IDEMPOTENCY_KEY_REQUIRED',
  'IDEMPOTENCY_KEY_REUSED',
  'RATE_LIMITED',
  'DEPENDENCY_UNAVAILABLE',
  'INTERNAL_ERROR',
] as const;

export type ApiErrorCode = (typeof API_ERROR_CODES)[number];

export interface SuccessResponse<T> {
  data: T;
  meta: {
    requestId: string;
    nextCursor?: string | null;
  };
}

export interface ErrorResponse {
  error: {
    code: ApiErrorCode;
    message: string;
    requestId: string;
    fieldErrors?: Record<string, string[]>;
    retryable: boolean;
  };
}

export const uuidSchema = z.uuid();
export const moneySchema = z.string().regex(/^\d{1,10}\.\d{2}$/);
export const monthSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);
export const dateSchema = z.iso.date();

export const PERSONAL_CATEGORIES = [
  'Food',
  'Transport',
  'Shopping',
  'Entertainment',
  'Bills',
  'Health',
  'Education',
  'Travel',
  'Groceries',
  'Rent',
  'Salary',
  'Freelance',
  'Other',
] as const;

export const positiveMoneyInputSchema = z
  .string()
  .regex(/^\d{1,10}(?:\.\d{1,2})?$/)
  .refine((value) => {
    const [whole, fraction = ''] = value.split('.');
    const cents = BigInt(whole) * BigInt(100) + BigInt(fraction.padEnd(2, '0'));
    return cents > BigInt(0) && cents <= BigInt('999999999999');
  }, 'Amount must be positive and fit the supported range.')
  .transform((value) => {
    const [whole, fraction = ''] = value.split('.');
    return `${BigInt(whole).toString()}.${fraction.padEnd(2, '0')}`;
  });

export const personalTransactionCreateSchema = z.strictObject({
  title: z.string().trim().min(1).max(120),
  amount: positiveMoneyInputSchema,
  category: z.enum(PERSONAL_CATEGORIES),
  type: z.enum(['income', 'expense']),
  note: z.string().trim().max(500).nullable().optional(),
  expenseDate: dateSchema,
});

export const personalTransactionPatchSchema = personalTransactionCreateSchema
  .partial()
  .refine((value) => Object.keys(value).length > 0, 'At least one field is required.');

export const personalTransactionListQuerySchema = z.strictObject({
  month: monthSchema,
  type: z.enum(['all', 'income', 'expense']).default('all'),
  cursor: z.string().min(1).max(500).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
});

export const groupCreateSchema = z.strictObject({
  name: z.string().trim().min(1).max(100),
  description: z.string().trim().max(500).nullable().optional(),
});

export const groupPatchSchema = z.strictObject({
  name: z.string().trim().min(1).max(100).optional(),
  description: z.string().trim().max(500).nullable().optional(),
  simplifiedDebts: z.boolean().optional(),
}).refine((value) => Object.keys(value).length > 0, 'At least one field is required.');

export const groupMemberAddSchema = z.strictObject({
  email: z.string().trim().toLowerCase().pipe(z.email().max(320)),
});

export const groupListQuerySchema = z.strictObject({
  cursor: z.string().min(1).max(500).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
});

export const profilePatchSchema = z
  .object({
    fullName: z.string().trim().min(1).max(100).optional(),
    upiId: z.string().trim().min(3).max(256).regex(/^[A-Za-z0-9._-]{2,}@[A-Za-z0-9.-]{2,}$/).nullable().optional(),
  })
  .strict()
  .refine((value) => value.fullName !== undefined || value.upiId !== undefined, {
    message: 'At least one field must be provided.',
  });

export const signUpSchema = z.object({
  fullName: z.string().trim().min(1).max(100),
  email: z.string().trim().toLowerCase().pipe(z.email().max(320)),
  password: z.string().min(8).max(128),
}).strict();

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email().max(320)),
  password: z.string().min(1).max(128),
}).strict();

export const oauthSchema = z.object({
  next: z.string().max(500).optional(),
}).strict();

export const avatarTicketSchema = z.object({
  contentType: z.enum(['image/jpeg', 'image/png', 'image/webp']),
  sizeBytes: z.number().int().positive().max(5 * 1024 * 1024),
}).strict();

export const avatarCompleteSchema = z.object({
  path: z.string().min(1).max(512),
}).strict();

export const groupImageTicketSchema = avatarTicketSchema;
export const groupImageCompleteSchema = avatarCompleteSchema;
