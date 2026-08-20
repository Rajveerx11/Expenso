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
  'SETTLED_EXPENSE_IMMUTABLE',
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

const nonnegativeMoneyInputSchema = z
  .string()
  .regex(/^\d{1,10}(?:\.\d{1,2})?$/)
  .refine((value) => {
    const [whole, fraction = ''] = value.split('.');
    const cents = BigInt(whole) * BigInt(100) + BigInt(fraction.padEnd(2, '0'));
    return cents <= BigInt('999999999999');
  }, 'Amount must fit the supported range.')
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

const groupExpenseBase = {
  paidBy: uuidSchema,
  title: z.string().trim().min(1).max(120),
  totalAmount: positiveMoneyInputSchema,
  category: z.enum(PERSONAL_CATEGORIES),
  note: z.string().trim().max(500).nullable().optional(),
  expenseDate: dateSchema,
};

const percentageInputSchema = z
  .string()
  .regex(/^(?:100(?:\.0{1,4})?|\d{1,2}(?:\.\d{1,4})?)$/)
  .refine((value) => Number(value) > 0, 'Percentage must be positive.')
  .transform((value) => {
    const [whole, fraction = ''] = value.split('.');
    return `${BigInt(whole).toString()}.${fraction.padEnd(4, '0')}`;
  });

const equalSplitSchema = z.strictObject({
  userId: uuidSchema,
  // Browser preview accepted, then ignored by authoritative server allocation.
  owedAmount: nonnegativeMoneyInputSchema.optional(),
});

const exactSplitSchema = z.strictObject({
  userId: uuidSchema,
  owedAmount: positiveMoneyInputSchema,
});

const percentageSplitSchema = z.strictObject({
  userId: uuidSchema,
  percentage: percentageInputSchema,
  // Browser preview accepted, then ignored by authoritative server allocation.
  owedAmount: nonnegativeMoneyInputSchema.optional(),
});

export const groupExpenseCreateSchema = z.discriminatedUnion('splitType', [
  z.strictObject({
    ...groupExpenseBase,
    splitType: z.literal('equal'),
    splits: z.array(equalSplitSchema).min(1).max(500),
  }),
  z.strictObject({
    ...groupExpenseBase,
    splitType: z.literal('exact'),
    splits: z.array(exactSplitSchema).min(1).max(500),
  }),
  z.strictObject({
    ...groupExpenseBase,
    splitType: z.literal('percentage'),
    splits: z.array(percentageSplitSchema).min(1).max(500),
  }),
]);

export const groupExpenseListQuerySchema = z.strictObject({
  cursor: z.string().min(1).max(500).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
});

export const settlementCreateSchema = z.strictObject({
  receiverId: uuidSchema,
  amount: positiveMoneyInputSchema,
  transactionRef: z.string().trim().min(1).max(200).nullable().optional(),
});

export const settlementListQuerySchema = z.strictObject({
  cursor: z.string().min(1).max(500).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
});

export function isSupportedWebPushEndpoint(value: string): boolean {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    return url.protocol === 'https:'
      && !url.username
      && !url.password
      && (!url.port || url.port === '443')
      && (
        host === 'fcm.googleapis.com'
        || host === 'updates.push.services.mozilla.com'
        || host === 'push.services.mozilla.com'
        || host === 'web.push.apple.com'
        || host.endsWith('.notify.windows.com')
      );
  } catch { return false; }
}

const webPushEndpointSchema = z.url().max(2048).refine(isSupportedWebPushEndpoint, 'Unsupported Web Push endpoint.');

const webPushKeySchema = z.string().regex(/^[A-Za-z0-9_-]+$/);

export const webPushSubscriptionSchema = z.strictObject({
  endpoint: webPushEndpointSchema,
  expirationTime: z.number().int().nonnegative().max(8_640_000_000_000_000).nullable()
    .refine((value) => value === null || value > Date.now(), 'Expiration time must be in the future.'),
  keys: z.strictObject({
    p256dh: webPushKeySchema.min(43).max(256),
    auth: webPushKeySchema.min(16).max(128),
  }),
  userAgent: z.string().trim().min(1).max(300).nullable().optional(),
});

export const notificationListQuerySchema = z.strictObject({
  cursor: z.string().min(1).max(500).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
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

export const avatarTicketSchema = z.object({
  contentType: z.enum(['image/jpeg', 'image/png', 'image/webp']),
  sizeBytes: z.number().int().positive().max(5 * 1024 * 1024),
}).strict();

export const avatarCompleteSchema = z.object({
  path: z.string().min(1).max(512),
}).strict();

export const groupImageTicketSchema = avatarTicketSchema;
export const groupImageCompleteSchema = avatarCompleteSchema;
