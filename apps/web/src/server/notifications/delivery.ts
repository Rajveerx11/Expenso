import 'server-only';
import { timingSafeEqual } from 'node:crypto';
import { after } from 'next/server';
import webPush from 'web-push';
import { AppError, mapDataError } from '@/server/http/errors';
import { getWebPushConfig } from '@/server/config/env';
import { createAdminClient } from '@/server/supabase/admin';
import { isSupportedWebPushEndpoint } from '@/shared/api/contracts';

interface DeliveryClaim {
  delivery_id: string; notification_id: string; endpoint: string; p256dh: string; auth: string;
  type: string; title: string; message: string; href: string; created_at: string; attempt_count: number;
}

type DeliveryOutcome = 'sent' | 'invalid' | 'retry' | 'failed';

function safeHref(value: string): string {
  return /^\/groups\/[0-9a-f-]{36}(?:\/settlements\/[0-9a-f-]{36})?$/i.test(value) || value === '/notifications'
    ? value : '/notifications';
}

export function secretMatches(header: string | null, secret: string): boolean {
  const expected = `Bearer ${secret}`;
  const left = Buffer.from(header ?? '');
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function retryDelaySeconds(attempt: number, retryAfter: string | undefined, random = Math.random): number {
  if (retryAfter) {
    const numeric = Number(retryAfter);
    const dateSeconds = (Date.parse(retryAfter) - Date.now()) / 1000;
    const parsed = Number.isFinite(numeric) ? numeric : dateSeconds;
    if (Number.isFinite(parsed) && parsed > 0) return Math.min(3600, Math.max(1, Math.ceil(parsed)));
  }
  const cap = Math.min(3600, 30 * 2 ** Math.max(0, attempt - 1));
  return Math.max(1, Math.ceil(random() * cap));
}

export function classifyPushFailure(
  statusCode: number | undefined,
  attempt: number,
  retryAfter?: string,
): { outcome: DeliveryOutcome; code: string; retryAfterSeconds: number | null } {
  if (statusCode === 404 || statusCode === 410) return { outcome: 'invalid', code: `HTTP_${statusCode}`, retryAfterSeconds: null };
  if (attempt >= 8) return { outcome: 'failed', code: statusCode ? `HTTP_${statusCode}` : 'NETWORK_ERROR', retryAfterSeconds: null };
  const retryable = !statusCode || statusCode === 408 || statusCode === 425 || statusCode === 429 || statusCode >= 500
    || statusCode === 401 || statusCode === 403;
  if (retryable) return {
    outcome: 'retry', code: statusCode ? `HTTP_${statusCode}` : 'NETWORK_ERROR',
    retryAfterSeconds: retryDelaySeconds(attempt, retryAfter),
  };
  return { outcome: 'failed', code: `HTTP_${statusCode}`, retryAfterSeconds: null };
}

async function complete(
  client: ReturnType<typeof createAdminClient>, claim: DeliveryClaim, leaseToken: string,
  outcome: DeliveryOutcome, code: string | null, retryAfterSeconds: number | null,
) {
  const { error } = await client.rpc('complete_web_push_delivery', {
    delivery_id_param: claim.delivery_id,
    lease_token_param: leaseToken,
    outcome_param: outcome,
    error_code_param: code,
    error_param: code,
    retry_after_seconds_param: retryAfterSeconds,
  });
  if (error) throw mapDataError(error, 'DEPENDENCY_UNAVAILABLE');
}

export async function drainWebPushDeliveries(
  limit = 25,
  notificationId: string | null = null,
): Promise<{ claimed: number; sent: number; invalid: number; retried: number; failed: number }> {
  const boundedLimit = Math.max(1, Math.min(50, Math.trunc(limit)));
  const vapid = getWebPushConfig();
  const client = createAdminClient();
  const leaseToken = crypto.randomUUID();
  const { data, error } = await client.rpc('claim_web_push_deliveries', {
    limit_param: boundedLimit,
    lease_token_param: leaseToken,
    lease_seconds_param: 45,
    notification_id_param: notificationId,
  });
  if (error) throw mapDataError(error, 'DEPENDENCY_UNAVAILABLE');
  const claims = (data ?? []) as DeliveryClaim[];
  const result = { claimed: claims.length, sent: 0, invalid: 0, retried: 0, failed: 0 };

  await Promise.all(claims.map(async (claim) => {
    const payload = JSON.stringify({
      v: 1, notificationId: claim.notification_id, type: claim.type,
      title: claim.title, message: claim.message, href: safeHref(claim.href), createdAt: claim.created_at,
    });
    if (!isSupportedWebPushEndpoint(claim.endpoint)) {
      await complete(client, claim, leaseToken, 'failed', 'UNSAFE_PUSH_ENDPOINT', null);
      result.failed += 1;
      return;
    }
    try {
      await webPush.sendNotification(
        { endpoint: claim.endpoint, keys: { p256dh: claim.p256dh, auth: claim.auth } },
        payload,
        {
          vapidDetails: { subject: vapid.subject, publicKey: vapid.publicKey, privateKey: vapid.privateKey },
          TTL: 86400, urgency: 'normal', timeout: 10000,
          topic: claim.notification_id.replaceAll('-', '').slice(0, 32),
        },
      );
      await complete(client, claim, leaseToken, 'sent', null, null);
      result.sent += 1;
    } catch (error) {
      const pushError = error as { statusCode?: number; headers?: Record<string, string | string[] | undefined> };
      const retryHeader = pushError.headers?.['retry-after'];
      const classified = classifyPushFailure(
        pushError.statusCode, Number(claim.attempt_count),
        Array.isArray(retryHeader) ? retryHeader[0] : retryHeader,
      );
      await complete(client, claim, leaseToken, classified.outcome, classified.code, classified.retryAfterSeconds);
      if (classified.outcome === 'invalid') result.invalid += 1;
      else if (classified.outcome === 'retry') result.retried += 1;
      else result.failed += 1;
    }
  }));
  return result;
}

export function scheduleNotificationDelivery(): void {
  try {
    after(async () => {
      try { await drainWebPushDeliveries(10); }
      catch { console.error(JSON.stringify({ level: 'error', code: 'PUSH_DELIVERY_FAILED' })); }
    });
  } catch {
    // Unit tests and non-Next runtimes have no after-response request context.
  }
}

export function unauthorizedInternalRequest(): AppError {
  return new AppError({ code: 'AUTH_REQUIRED', status: 401, message: 'Unauthorized.' });
}
