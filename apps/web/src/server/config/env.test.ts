import { afterEach, describe, expect, it } from 'vitest';
import { ConfigurationError, getCronSecret, getDatabaseWebhookSecret, getWebPushConfig } from './env';

const names = ['CRON_SECRET', 'DATABASE_WEBHOOK_SECRET', 'VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY', 'VAPID_SUBJECT'] as const;
const original = Object.fromEntries(names.map((name) => [name, process.env[name]]));

afterEach(() => {
  for (const name of names) {
    const value = original[name];
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});

describe('internal delivery configuration', () => {
  it('accepts exact VAPID P-256 key encodings and a contact subject', () => {
    process.env.VAPID_PUBLIC_KEY = 'A'.repeat(87);
    process.env.VAPID_PRIVATE_KEY = 'B'.repeat(43);
    process.env.VAPID_SUBJECT = 'mailto:ops@example.com';
    expect(getWebPushConfig()).toMatchObject({ subject: 'mailto:ops@example.com' });
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
