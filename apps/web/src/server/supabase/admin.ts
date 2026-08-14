import 'server-only';
import { createClient } from '@supabase/supabase-js';
import { getServiceRoleConfig } from '@/server/config/env';

export function createAdminClient() {
  const { supabaseUrl, serviceRoleKey } = getServiceRoleConfig();
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
}
