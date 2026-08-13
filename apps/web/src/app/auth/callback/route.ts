import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { getRuntimeConfig } from '@/server/config/env';
import { safeRelativePath } from '@/server/http/security';
import { createClient } from '@/server/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const { siteUrl } = getRuntimeConfig();
  const code = request.nextUrl.searchParams.get('code');
  const next = safeRelativePath(request.nextUrl.searchParams.get('next'));
  if (code) {
    const client = await createClient();
    const { error } = await client.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(next, siteUrl));
  }
  return NextResponse.redirect(new URL('/login?error=oauth_failed', siteUrl));
}
