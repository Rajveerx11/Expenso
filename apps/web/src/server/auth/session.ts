import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { redirect } from 'next/navigation';
import { uuidSchema } from '@/shared/api/contracts';
import { AppError } from '@/server/http/errors';
import { createClient } from '@/server/supabase/server';

export interface AuthenticatedContext {
  client: SupabaseClient;
  userId: string;
  email: string | null;
}

export async function requireApiUser(): Promise<AuthenticatedContext> {
  const client = await createClient();
  const { data, error } = await client.auth.getClaims();
  const userId = data?.claims.sub;
  if (error || !userId || !uuidSchema.safeParse(userId).success) {
    throw new AppError({ code: 'AUTH_REQUIRED', status: 401 });
  }

  return {
    client,
    userId,
    email: typeof data.claims.email === 'string' ? data.claims.email : null,
  };
}

export async function requirePageUser(returnPath = '/dashboard'): Promise<AuthenticatedContext> {
  try {
    return await requireApiUser();
  } catch (error) {
    if (error instanceof AppError && error.code === 'AUTH_REQUIRED') {
      redirect(`/login?next=${encodeURIComponent(returnPath)}`);
    }
    throw error;
  }
}
