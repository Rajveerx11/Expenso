import 'server-only';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { getRuntimeConfig } from '@/server/config/env';

export async function createClient() {
  const cookieStore = await cookies();
  const { supabaseUrl, supabasePublishableKey } = getRuntimeConfig();

  return createServerClient(supabaseUrl, supabasePublishableKey, {
    cookieOptions: {
      httpOnly: true,
      path: '/',
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
    },
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, { ...options, httpOnly: true }));
        } catch {
          // Server Components cannot write cookies. Proxy refresh owns that path.
        }
      },
    },
  });
}
