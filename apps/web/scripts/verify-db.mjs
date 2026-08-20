import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;

for (const [name, value] of Object.entries({
  SUPABASE_URL: supabaseUrl,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: publishableKey,
  SUPABASE_SECRET_KEY: serviceRoleKey,
})) {
  if (!value?.trim()) throw new Error(`Missing ${name}.`);
}

const options = { auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false } };
const admin = createClient(supabaseUrl, serviceRoleKey, options);
const anonymous = createClient(supabaseUrl, publishableKey, options);
const tables = [
  'profiles',
  'groups',
  'group_members',
  'group_expenses',
  'expense_splits',
  'personal_expenses',
  'settlements',
  'payment_confirmations',
  'notifications',
  'notification_deliveries',
  'web_push_subscriptions',
  'web_push_notification_deliveries',
  'user_fcm_tokens',
];

let failed = false;

const { data: ready, error: readinessError } = await anonymous.rpc('expenso_backend_ready_20260815012000');
if (readinessError || ready !== true) {
  failed = true;
  console.error(`readiness: FAILED (${readinessError?.code ?? 'unexpected response'})`);
} else {
  console.log('readiness: OK');
}

for (const table of tables) {
  const { count, error } = await admin.from(table).select('*', { count: 'exact', head: true });
  if (error) {
    failed = true;
    console.error(`${table}: FAILED (${error.code ?? 'database error'})`);
  } else {
    console.log(`${table}: ${count ?? 0} rows`);
  }
}

for (const table of tables) {
  const { count, error } = await anonymous.from(table).select('*', { count: 'exact', head: true });
  if (!error && count && count > 0) {
    failed = true;
    console.error(`${table}: anonymous role can read ${count} rows`);
  }
}

if (failed) process.exitCode = 1;
else console.log('Database verification passed. No data was read or changed.');
