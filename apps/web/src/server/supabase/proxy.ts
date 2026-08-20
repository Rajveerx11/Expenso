import 'server-only';
import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { getRuntimeConfig } from '@/server/config/env';
import {
  contentSecurityPolicy,
  createCsrfToken,
  CSRF_COOKIE_NAME,
  safeRelativePath,
  setCsrfCookie,
} from '@/server/http/security';

const PROTECTED_PREFIXES = ['/dashboard', '/expenses', '/groups', '/notifications', '/profile', '/onboarding'];
const AUTH_PAGES = ['/login', '/signup'];

export async function updateSession(request: NextRequest): Promise<NextResponse> {
  const csp = contentSecurityPolicy();
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('Content-Security-Policy', csp);
  const existingCsrf = request.cookies.get(CSRF_COOKIE_NAME)?.value;
  const issuedCsrf = existingCsrf ? null : createCsrfToken();
  if (issuedCsrf) {
    request.cookies.set(CSRF_COOKIE_NAME, issuedCsrf);
    requestHeaders.set('cookie', request.cookies.toString());
  }
  const nextResponse = () => NextResponse.next({ request: { headers: requestHeaders } });
  let response = nextResponse();
  const { supabaseUrl, supabasePublishableKey } = getRuntimeConfig();
  const supabase = createServerClient(supabaseUrl, supabasePublishableKey, {
    cookieOptions: {
      httpOnly: true,
      path: '/',
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
    },
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        requestHeaders.set('cookie', request.cookies.toString());
        response = nextResponse();
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, { ...options, httpOnly: true }));
      },
    },
  });

  const { data } = await supabase.auth.getClaims();
  const isAuthenticated = Boolean(data?.claims.sub);
  const path = request.nextUrl.pathname;

  if (PROTECTED_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`)) && !isAuthenticated) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.search = '';
    url.searchParams.set('next', safeRelativePath(`${path}${request.nextUrl.search}`));
    response = NextResponse.redirect(url);
  } else if (AUTH_PAGES.includes(path) && isAuthenticated) {
    const url = request.nextUrl.clone();
    url.pathname = '/dashboard';
    url.search = '';
    response = NextResponse.redirect(url);
  }

  if (issuedCsrf) setCsrfCookie(response, issuedCsrf);
  response.headers.set('Content-Security-Policy', csp);
  return response;
}
