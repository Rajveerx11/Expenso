import 'server-only';
import { z } from 'zod';

const urlSchema = z.url().refine((value) => {
  const url = new URL(value);
  return url.protocol === 'https:'
    || (url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname));
}, { message: 'Expected HTTPS URL or an HTTP loopback origin.' });

export class ConfigurationError extends Error {
  constructor(message = 'Application configuration is unavailable.') {
    super(message);
    this.name = 'ConfigurationError';
  }
}

export interface PublicRuntimeConfig {
  supabaseUrl: string;
  supabasePublishableKey: string;
  siteUrl: string;
}

function required(name: string, value: string | undefined): string {
  if (!value?.trim()) throw new ConfigurationError(`Missing ${name}.`);
  return value.trim();
}

function parseUrl(name: string, value: string | undefined): string {
  const parsed = urlSchema.safeParse(required(name, value));
  if (!parsed.success) throw new ConfigurationError(`Invalid ${name}.`);
  return new URL(parsed.data).origin;
}

export function getRuntimeConfig(): PublicRuntimeConfig {
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
    ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL
    ?? (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : undefined)
    ?? (process.env.NEXT_PUBLIC_VERCEL_URL ? `https://${process.env.NEXT_PUBLIC_VERCEL_URL}` : undefined)
    ?? (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : undefined);

  return {
    supabaseUrl: parseUrl('NEXT_PUBLIC_SUPABASE_URL', process.env.NEXT_PUBLIC_SUPABASE_URL),
    supabasePublishableKey: required('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', publishableKey),
    siteUrl: parseUrl('NEXT_PUBLIC_SITE_URL', siteUrl),
  };
}

export function getAllowedOrigins(): ReadonlySet<string> {
  const { siteUrl } = getRuntimeConfig();
  const configured = (process.env.APP_ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean)
    .map((origin) => {
      const parsed = urlSchema.safeParse(origin);
      if (!parsed.success) throw new ConfigurationError('Invalid APP_ALLOWED_ORIGINS entry.');
      return new URL(parsed.data).origin;
    });

  const origins = new Set([siteUrl, ...configured]);
  if (process.env.VERCEL_URL) {
    origins.add(`https://${process.env.VERCEL_URL}`);
  }
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    origins.add(`https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`);
  }
  if (process.env.NODE_ENV !== 'production') {
    origins.add('http://localhost:3000');
    origins.add('http://127.0.0.1:3000');
  }
  return origins;
}

export function getRateLimitSalt(): string {
  const salt = required('RATE_LIMIT_SALT', process.env.RATE_LIMIT_SALT);
  if (salt.length < 32) throw new ConfigurationError('RATE_LIMIT_SALT must be at least 32 characters.');
  return salt;
}

export function getRateLimitSecret(): string {
  const secret = required('RATE_LIMIT_SECRET', process.env.RATE_LIMIT_SECRET);
  if (secret.length < 32) throw new ConfigurationError('RATE_LIMIT_SECRET must be at least 32 characters.');
  return secret;
}

export function getServiceRoleConfig() {
  const secretKey = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  return {
    supabaseUrl: parseUrl('SUPABASE_URL', process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL),
    serviceRoleKey: required('SUPABASE_SECRET_KEY', secretKey),
  };
}

export function getVapidPublicKey(): string {
  const publicKey = required('VAPID_PUBLIC_KEY', process.env.VAPID_PUBLIC_KEY ?? process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY);
  if (!/^[A-Za-z0-9_-]{87}$/.test(publicKey)) {
    throw new ConfigurationError('Invalid VAPID public key configuration.');
  }
  return publicKey;
}

export function getWebPushConfig() {
  const publicKey = getVapidPublicKey();
  const privateKey = required('VAPID_PRIVATE_KEY', process.env.VAPID_PRIVATE_KEY);
  const subject = required('VAPID_SUBJECT', process.env.VAPID_SUBJECT);
  if (!/^[A-Za-z0-9_-]{43}$/.test(privateKey)) {
    throw new ConfigurationError('Invalid VAPID key configuration.');
  }
  if (!/^mailto:[^\s@]+@[^\s@]+$/.test(subject) && !/^https:\/\/[^\s]+$/.test(subject)) {
    throw new ConfigurationError('Invalid VAPID_SUBJECT.');
  }
  return { publicKey, privateKey, subject };
}

export function getCronSecret(): string {
  const value = required('CRON_SECRET', process.env.CRON_SECRET);
  if (value.length < 32) throw new ConfigurationError('CRON_SECRET must be at least 32 characters.');
  return value;
}

export function getDatabaseWebhookSecret(): string {
  const value = required('DATABASE_WEBHOOK_SECRET', process.env.DATABASE_WEBHOOK_SECRET);
  if (value.length < 32) throw new ConfigurationError('DATABASE_WEBHOOK_SECRET must be at least 32 characters.');
  return value;
}
