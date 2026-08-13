import { z } from 'zod';
import type { ApiErrorCode } from '@/shared/api/contracts';
import { ConfigurationError } from '@/server/config/env';
import type { AuthError } from '@supabase/supabase-js';

const DEFAULT_MESSAGES: Record<ApiErrorCode, string> = {
  AUTH_REQUIRED: 'Sign in to continue.',
  FORBIDDEN: 'You do not have permission to perform this action.',
  NOT_FOUND: 'The requested item was not found.',
  VALIDATION_ERROR: 'Some request fields are invalid.',
  CONFLICT: 'The request conflicts with the current state.',
  MEMBER_ALREADY_EXISTS: 'This user is already a group member.',
  REGISTERED_USER_NOT_FOUND: 'No registered user was found for that email.',
  UNRESOLVED_MEMBER_DEBT: 'This member still has unresolved debt.',
  GROUP_HISTORY_RETAINED: 'This group has history that must be retained.',
  PENDING_SETTLEMENT_EXISTS: 'A pending settlement already exists.',
  SETTLEMENT_EXCEEDS_BALANCE: 'The settlement exceeds the latest balance.',
  SETTLEMENT_CHANGED: 'The balance changed before confirmation.',
  LINKED_TRANSACTION_READ_ONLY: 'Group-linked transactions are read-only here.',
  IDEMPOTENCY_KEY_REQUIRED: 'An idempotency key is required.',
  IDEMPOTENCY_KEY_REUSED: 'This idempotency key was used for a different request.',
  RATE_LIMITED: 'Too many requests. Try again later.',
  DEPENDENCY_UNAVAILABLE: 'A required service is temporarily unavailable.',
  INTERNAL_ERROR: 'Something went wrong.',
};

export class AppError extends Error {
  readonly code: ApiErrorCode;
  readonly status: number;
  readonly retryable: boolean;
  readonly fieldErrors?: Record<string, string[]>;
  readonly retryAfterSeconds?: number;

  constructor(options: {
    code: ApiErrorCode;
    status: number;
    message?: string;
    retryable?: boolean;
    fieldErrors?: Record<string, string[]>;
    retryAfterSeconds?: number;
    cause?: unknown;
  }) {
    super(options.message ?? DEFAULT_MESSAGES[options.code], { cause: options.cause });
    this.name = 'AppError';
    this.code = options.code;
    this.status = options.status;
    this.retryable = options.retryable ?? false;
    this.fieldErrors = options.fieldErrors;
    this.retryAfterSeconds = options.retryAfterSeconds;
  }
}

export function mapAuthError(error: AuthError | null, context: 'login' | 'signup' | 'oauth'): AppError {
  const status = error?.status ?? 0;
  if (status === 429) {
    return new AppError({ code: 'RATE_LIMITED', status: 429, retryable: true, cause: error });
  }
  if (status >= 500 || status === 0) {
    return new AppError({ code: 'DEPENDENCY_UNAVAILABLE', status: 503, retryable: true, cause: error });
  }
  if (context === 'login') {
    return new AppError({ code: 'AUTH_REQUIRED', status: 401, message: 'Email or password is incorrect.', cause: error });
  }
  if (context === 'signup') {
    return new AppError({
      code: 'VALIDATION_ERROR',
      status: 422,
      message: 'Unable to create this account.',
      fieldErrors: { email: ['Unable to create this account.'] },
      cause: error,
    });
  }
  return new AppError({ code: 'DEPENDENCY_UNAVAILABLE', status: 503, retryable: true, cause: error });
}

export function validationError(error: z.ZodError): AppError {
  const flattened = z.flattenError(error);
  const fieldErrors = Object.fromEntries(
    Object.entries(flattened.fieldErrors)
      .filter((entry): entry is [string, string[]] => Array.isArray(entry[1]))
  );
  if (flattened.formErrors.length > 0) fieldErrors._form = flattened.formErrors;

  return new AppError({
    code: 'VALIDATION_ERROR',
    status: 422,
    fieldErrors,
  });
}

interface SupabaseLikeError {
  code?: string;
  message?: string;
}

export function mapDataError(error: SupabaseLikeError | null, fallbackCode: ApiErrorCode = 'INTERNAL_ERROR'): AppError {
  if (!error) return new AppError({ code: fallbackCode, status: 500 });
  if (error.code === 'PGRST116') return new AppError({ code: 'NOT_FOUND', status: 404, cause: error });
  if (error.code === '42501') return new AppError({ code: 'FORBIDDEN', status: 403, cause: error });
  if (error.code === '23505') return new AppError({ code: 'CONFLICT', status: 409, cause: error });
  if (error.code === '23514' || error.code === '22P02') {
    return new AppError({ code: 'VALIDATION_ERROR', status: 422, cause: error });
  }
  return new AppError({
    code: fallbackCode,
    status: fallbackCode === 'DEPENDENCY_UNAVAILABLE' ? 503 : 500,
    retryable: true,
    cause: error,
  });
}

export function normalizeError(error: unknown): AppError {
  if (error instanceof AppError) return error;
  if (error instanceof z.ZodError) return validationError(error);
  if (error instanceof ConfigurationError) {
    return new AppError({ code: 'DEPENDENCY_UNAVAILABLE', status: 503, retryable: true, cause: error });
  }
  return new AppError({ code: 'INTERNAL_ERROR', status: 500, cause: error });
}
