import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { getRequestOrigin, safeRelativePath } from '@/server/http/security';
import { createClient } from '@/server/supabase/server';

export const dynamic = 'force-dynamic';

interface AuthUserTiming {
  created_at?: string;
  last_sign_in_at?: string;
}

export function isFirstAuthSignIn(user: AuthUserTiming | null | undefined): boolean {
  const createdAt = Date.parse(user?.created_at ?? '');
  const lastSignInAt = Date.parse(user?.last_sign_in_at ?? '');
  return Number.isFinite(createdAt)
    && Number.isFinite(lastSignInAt)
    && lastSignInAt >= createdAt
    && lastSignInAt - createdAt <= 10_000;
}

export function firstUseDestination(next: string): string {
  if (next === '/onboarding' || next.startsWith('/onboarding?')) return next;
  return `/onboarding?next=${encodeURIComponent(next)}`;
}

export async function GET(request: NextRequest) {
  const origin = getRequestOrigin(request);
  const code = request.nextUrl.searchParams.get('code');
  const next = safeRelativePath(request.nextUrl.searchParams.get('next'));
  if (code) {
    const client = await createClient();
    const { data, error } = await client.auth.exchangeCodeForSession(code);
    if (!error) {
      const destination = isFirstAuthSignIn(data?.user) ? firstUseDestination(next) : next;
      return NextResponse.redirect(new URL(destination, origin));
    }
  }
  const loginUrl = new URL('/login', origin);
  loginUrl.searchParams.set('error', 'confirmation_failed');
  loginUrl.searchParams.set('next', next);
  return NextResponse.redirect(loginUrl);
}
