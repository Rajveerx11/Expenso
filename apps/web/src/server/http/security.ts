import 'server-only';
import { timingSafeEqual, randomBytes } from 'node:crypto';
import type { NextResponse } from 'next/server';
import { getAllowedOrigins, getRuntimeConfig } from '@/server/config/env';
import { AppError } from '@/server/http/errors';

export const CSRF_COOKIE_NAME = 'expenso.csrf';
export const CSRF_HEADER_NAME = 'x-csrf-token';

export function contentSecurityPolicy(_nonce?: string): string {
  const supabaseOrigin = getRuntimeConfig().supabaseUrl;
  const supabaseWebSocketOrigin = supabaseOrigin.replace(/^http/, 'ws');
  return [
    "default-src 'self'",
    "base-uri 'self'",
    `connect-src 'self' ${supabaseOrigin} ${supabaseWebSocketOrigin}`,
    "font-src 'self' data:",
    "form-action 'self'",
    "frame-ancestors 'none'",
    `img-src 'self' data: blob: ${supabaseOrigin} https://lh3.googleusercontent.com`,
    "object-src 'none'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
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
  let originUrl: URL | null = null;
  try {
    originUrl = origin ? new URL(origin) : null;
  } catch {
    originUrl = null;
  }
  const hostHeader = request.headers.get('host')?.trim();
  const requestHost = hostHeader && !/[\s,/@]/.test(hostHeader)
    ? hostHeader.toLowerCase()
    : new URL(request.url).host.toLowerCase();
  if (
    !originUrl
    || origin !== originUrl.origin
    || originUrl.host.toLowerCase() !== requestHost
    || !getAllowedOrigins().has(originUrl.origin)
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
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.includes('\\') || /[\u0000-\u001F\u007F]|%(?:0[0-9A-F]|1[0-9A-F]|7F)/i.test(value)) return fallback;
  try {
    const base = 'https://expenso.invalid';
    const parsed = new URL(value, base);
    return parsed.origin === base ? `${parsed.pathname}${parsed.search}${parsed.hash}` : fallback;
  } catch {
    return fallback;
  }
}
