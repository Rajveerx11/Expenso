import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://rspuqbcgjqezimwwpbzl.supabase.co';
const SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJzcHVxYmNnanFlemltd3dwYnpsIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NjM0Mjg5MCwiZXhwIjoyMTAxOTE4ODkwfQ.IS57n7Knnq2Q7s-sWzDUU8xn-3p5zo_XdMsuJwgtD2Y';
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJzcHVxYmNnanFlemltd3dwYnpsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODYzNDI4OTAsImV4cCI6MjEwMTkxODg5MH0.DpxNbLuq-NzvStb5kw6-hnJB5e28Fz7txHLhLi4zAUQ';

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
const anon = createClient(SUPABASE_URL, ANON_KEY);

const TABLES = [
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

async function main() {
  console.log('====================================================');
  console.log('   EXPENSO DATABASE VERIFICATION & CLEANUP AUDIT    ');
  console.log('====================================================\n');
  console.log('Project URL:', SUPABASE_URL);

  // 1. Check RPC Readiness
  console.log('\n--- 1. Testing Backend Readiness RPC ---');
  const { data: readyData, error: readyErr } = await admin.rpc('expenso_backend_ready_20260815012000');
  if (readyErr) {
    console.error('❌ Readiness RPC failed:', readyErr);
  } else {
    console.log('✅ expenso_backend_ready_20260815012000 ->', readyData);
  }

  // 2. Delete test data (test_direct@example.com)
  console.log('\n--- 2. Cleaning Test Data ---');
  const { data: { users }, error: listUsersErr } = await admin.auth.admin.listUsers();
  if (listUsersErr) {
    console.error('❌ Could not list auth users:', listUsersErr);
  } else {
    for (const user of users) {
      if (user.email === 'test_direct@example.com' || user.email?.startsWith('test_') || user.email?.includes('testuser')) {
        console.log(`Found test user: ${user.email} (${user.id}). Deleting...`);
        // Delete profile
        const { error: pDelErr } = await admin.from('profiles').delete().eq('id', user.id);
        if (pDelErr) console.warn('Warning deleting profile:', pDelErr.message);
        // Delete auth user
        const { error: uDelErr } = await admin.auth.admin.deleteUser(user.id);
        if (uDelErr) console.warn('Warning deleting auth user:', uDelErr.message);
        else console.log(`✅ Test user ${user.email} deleted successfully.`);
      }
    }
  }

  // 3. Verify Active Users and Profiles
  console.log('\n--- 3. Active Real Users & Profiles ---');
  const { data: profiles, error: pErr } = await admin.from('profiles').select('*');
  if (pErr) console.error('❌ Profiles error:', pErr);
  else {
    console.log(`Total real profiles remaining: ${profiles.length}`);
    for (const p of profiles) {
      console.log(` - ${p.full_name || 'No Name'} (${p.email}), UPI: ${p.upi_id || 'None'}, Avatar: ${p.avatar_url ? 'Yes' : 'No'}`);
    }
  }

  // 4. Verify Row Level Security (RLS) on all tables via anon client
  console.log('\n--- 4. Row Level Security (RLS) Verification (Anon Access) ---');
  for (const table of TABLES) {
    const { data, error } = await anon.from(table).select('*');
    if (error) {
      console.log(`✅ ${table.padEnd(35)} -> Protected (Error: ${error.message.slice(0, 40)}...)`);
    } else {
      if (data.length === 0) {
        console.log(`✅ ${table.padEnd(35)} -> Protected (0 rows accessible to anon)`);
      } else {
        console.warn(`⚠️ ${table.padEnd(35)} -> Returned ${data.length} rows to anon!`);
      }
    }
  }

  // 5. Verify Table Row Counts via Admin
  console.log('\n--- 5. Database Table Record Counts (Admin Access) ---');
  for (const table of TABLES) {
    const { data, error } = await admin.from(table).select('*');
    if (error) {
      console.error(`❌ ${table}: ${error.message}`);
    } else {
      console.log(` - ${table.padEnd(35)} : ${data.length} records`);
    }
  }

  // 6. Verify Storage Buckets
  console.log('\n--- 6. Storage Buckets Verification ---');
  const { data: buckets, error: bErr } = await admin.storage.listBuckets();
  if (bErr) console.error('❌ Storage buckets error:', bErr);
  else {
    console.log(`Found ${buckets.length} storage buckets:`);
    for (const b of buckets) {
      const { data: files } = await admin.storage.from(b.name).list();
      console.log(` - Bucket '${b.name}' (public: ${b.public}) -> ${files?.length || 0} objects`);
    }
  }

  console.log('\n====================================================');
  console.log('            DATABASE AUDIT COMPLETED                ');
  console.log('====================================================\n');
}

main().catch(console.error);
