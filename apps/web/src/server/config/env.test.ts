import { afterEach, describe, expect, it } from 'vitest';
import {
  ConfigurationError,
  getCronSecret,
  getDatabaseWebhookSecret,
  getServiceRoleConfig,
  getVapidPublicKey,
  getWebPushConfig,
  getRuntimeConfig,
} from './env';

const names = [
  'CRON_SECRET', 'DATABASE_WEBHOOK_SECRET', 'VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY', 'VAPID_SUBJECT',
  'SUPABASE_URL', 'SUPABASE_SECRET_KEY', 'SUPABASE_SERVICE_ROLE_KEY',
  'NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'NEXT_PUBLIC_SITE_URL',
] as const;
const original = Object.fromEntries(names.map((name) => [name, process.env[name]]));

afterEach(() => {
  for (const name of names) {
    const value = original[name];
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});

describe('internal delivery configuration', () => {
  it('permits HTTP only for local loopback Supabase development', () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://127.0.0.1:55321';
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'local-key';
    process.env.NEXT_PUBLIC_SITE_URL = 'http://localhost:3100';
    expect(getRuntimeConfig().supabaseUrl).toBe('http://127.0.0.1:55321');
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://supabase.internal:8000';
    expect(() => getRuntimeConfig()).toThrow(ConfigurationError);
  });
  it('accepts exact VAPID P-256 key encodings and a contact subject', () => {
    process.env.VAPID_PUBLIC_KEY = 'A'.repeat(87);
    process.env.VAPID_PRIVATE_KEY = 'B'.repeat(43);
    process.env.VAPID_SUBJECT = 'mailto:ops@example.com';
    expect(getWebPushConfig()).toMatchObject({ subject: 'mailto:ops@example.com' });
    expect(getVapidPublicKey()).toBe('A'.repeat(87));
  });

  it('reads only the validated public key for browser subscription setup', () => {
    process.env.VAPID_PUBLIC_KEY = 'C'.repeat(87);
    delete process.env.VAPID_PRIVATE_KEY;
    delete process.env.VAPID_SUBJECT;
    expect(getVapidPublicKey()).toBe('C'.repeat(87));
  });

  it('prefers a revocable Supabase secret key and retains legacy local-stack fallback', () => {
    process.env.SUPABASE_URL = 'https://example.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'legacy-service-role';
    process.env.SUPABASE_SECRET_KEY = 'sb_secret_replacement';
    expect(getServiceRoleConfig().serviceRoleKey).toBe('sb_secret_replacement');
    delete process.env.SUPABASE_SECRET_KEY;
    expect(getServiceRoleConfig().serviceRoleKey).toBe('legacy-service-role');
  });

  it('fails closed for malformed VAPID keys and short internal secrets', () => {
    process.env.VAPID_PUBLIC_KEY = 'A'.repeat(86);
    process.env.VAPID_PRIVATE_KEY = 'B'.repeat(43);
    process.env.VAPID_SUBJECT = 'mailto:ops@example.com';
    expect(() => getWebPushConfig()).toThrow(ConfigurationError);
    process.env.CRON_SECRET = 'short';
    process.env.DATABASE_WEBHOOK_SECRET = 'short';
    expect(() => getCronSecret()).toThrow(ConfigurationError);
    expect(() => getDatabaseWebhookSecret()).toThrow(ConfigurationError);
  });
});
