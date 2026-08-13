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
