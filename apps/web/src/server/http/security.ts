import 'server-only';
import { timingSafeEqual, randomBytes } from 'node:crypto';
import type { NextResponse } from 'next/server';
import { getAllowedOrigins } from '@/server/config/env';
import { AppError } from '@/server/http/errors';

export const CSRF_COOKIE_NAME = 'expenso.csrf';
export const CSRF_HEADER_NAME = 'x-csrf-token';

export function contentSecurityPolicy(nonce: string): string {
  const developmentScript = process.env.NODE_ENV === 'development' ? " 'unsafe-eval'" : '';
  return [
    "default-src 'self'",
    "base-uri 'self'",
    "connect-src 'self' https://*.supabase.co wss://*.supabase.co",
    "font-src 'self' data:",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "img-src 'self' data: blob: https://*.supabase.co",
    "object-src 'none'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${developmentScript}`,
    "style-src 'self' 'unsafe-inline'",
    "worker-src 'self' blob:",
  ].join('; ');
}

export function createCsrfToken(): string {
  return randomBytes(32).toString('base64url');
}

function safelyEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

export function assertMutationRequest(request: Request): void {
  const origin = request.headers.get('origin');
  const fetchSite = request.headers.get('sec-fetch-site');
  const requestOrigin = new URL(request.url).origin;
  if (
    !origin
    || origin !== requestOrigin
    || !getAllowedOrigins().has(origin)
    || (fetchSite && fetchSite !== 'same-origin')
  ) {
    throw new AppError({ code: 'FORBIDDEN', status: 403 });
  }

  const cookieHeader = request.headers.get('cookie') ?? '';
  const cookieToken = cookieHeader
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${CSRF_COOKIE_NAME}=`))
    ?.slice(CSRF_COOKIE_NAME.length + 1);
  const headerToken = request.headers.get(CSRF_HEADER_NAME);

  if (!cookieToken || !headerToken || !safelyEqual(decodeURIComponent(cookieToken), headerToken)) {
    throw new AppError({ code: 'FORBIDDEN', status: 403 });
  }
}

export function setCsrfCookie(response: NextResponse, token: string): void {
  response.cookies.set(CSRF_COOKIE_NAME, token, {
    httpOnly: false,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 8,
  });
}

export function safeRelativePath(value: string | null, fallback = '/dashboard'): string {
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.includes('\\')) return fallback;
  return value;
}
