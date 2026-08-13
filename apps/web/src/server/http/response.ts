import 'server-only';
import { NextResponse } from 'next/server';
import type { ZodType } from 'zod';
import type { ErrorResponse, SuccessResponse } from '@/shared/api/contracts';
import { AppError, normalizeError, validationError } from '@/server/http/errors';

const MAX_JSON_BYTES = 64 * 1024;
const REQUEST_ID_PATTERN = /^[A-Za-z0-9._-]{8,100}$/;

export function requestIdFor(request: Request): string {
  const supplied = request.headers.get('x-request-id');
  return supplied && REQUEST_ID_PATTERN.test(supplied) ? supplied : crypto.randomUUID();
}

function responseHeaders(requestId: string, isPrivate: boolean): HeadersInit {
  return {
    'Cache-Control': isPrivate ? 'private, no-store, max-age=0' : 'no-store, max-age=0',
    'Pragma': 'no-cache',
    'Vary': isPrivate ? 'Cookie' : 'Accept-Encoding',
    'X-Content-Type-Options': 'nosniff',
    'X-Request-Id': requestId,
  };
}

export function ok<T>(data: T, requestId: string, options?: {
  status?: number;
  isPrivate?: boolean;
  nextCursor?: string | null;
}): NextResponse<SuccessResponse<T>> {
  return NextResponse.json(
    {
      data,
      meta: {
        requestId,
        ...(options && 'nextCursor' in options ? { nextCursor: options.nextCursor } : {}),
      },
    },
    {
      status: options?.status ?? 200,
      headers: responseHeaders(requestId, options?.isPrivate ?? true),
    },
  );
}

export function fail(error: AppError, requestId: string): NextResponse<ErrorResponse> {
  const response = NextResponse.json(
    {
      error: {
        code: error.code,
        message: error.message,
        requestId,
        ...(error.fieldErrors ? { fieldErrors: error.fieldErrors } : {}),
        retryable: error.retryable,
      },
    },
    {
      status: error.status,
      headers: responseHeaders(requestId, true),
    },
  );
  if (error.retryAfterSeconds !== undefined) {
    response.headers.set('Retry-After', String(Math.max(1, Math.ceil(error.retryAfterSeconds))));
  }
  return response;
}

export function handleRouteError(error: unknown, requestId: string): NextResponse<ErrorResponse> {
  const normalized = normalizeError(error);
  if (normalized.status >= 500) {
    console.error(JSON.stringify({
      level: 'error',
      code: normalized.code,
      requestId,
      retryable: normalized.retryable,
    }));
  }
  return fail(normalized, requestId);
}

export async function parseJson<T>(request: Request, schema: ZodType<T>): Promise<T> {
  const contentType = request.headers.get('content-type')?.split(';', 1)[0].trim().toLowerCase();
  if (contentType !== 'application/json') {
    throw new AppError({
      code: 'VALIDATION_ERROR',
      status: 422,
      fieldErrors: { _form: ['Content-Type must be application/json.'] },
    });
  }

  const declaredLength = Number(request.headers.get('content-length') ?? '0');
  if (Number.isFinite(declaredLength) && declaredLength > MAX_JSON_BYTES) {
    throw new AppError({
      code: 'VALIDATION_ERROR',
      status: 422,
      fieldErrors: { _form: ['JSON body is too large.'] },
    });
  }

  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > MAX_JSON_BYTES) {
    throw new AppError({
      code: 'VALIDATION_ERROR',
      status: 422,
      fieldErrors: { _form: ['JSON body is too large.'] },
    });
  }

  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new AppError({
      code: 'VALIDATION_ERROR',
      status: 422,
      fieldErrors: { _form: ['Request body must be valid JSON.'] },
    });
  }

  const parsed = schema.safeParse(value);
  if (!parsed.success) throw validationError(parsed.error);
  return parsed.data;
}
