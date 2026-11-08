import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve(process.cwd(), '../../supabase/migrations/20260814051000_notifications_web_push.sql'),
  'utf8',
).toLowerCase();

describe('notification and Web Push database contract', () => {
  it('keeps the inbox canonical and its navigation path same-origin', () => {
    expect(migration).toContain('notifications_href_safe');
    expect(migration).toContain("href = '/notifications'");
    expect(migration).toContain("then '/groups/' || group_id_param::text || '/settlements/' || related_id_param::text");
    expect(migration).toContain('on conflict (recipient_id, event_key) do nothing');
  });

  it('protects subscription secrets behind session-derived RPCs', () => {
    expect(migration).toContain('alter table public.web_push_subscriptions enable row level security');
    expect(migration).toContain('revoke all on public.web_push_subscriptions from public, anon, authenticated');
    expect(migration).toContain('caller_id uuid := (select auth.uid())');
    expect(migration).toContain('perform pg_advisory_xact_lock(hashtextextended(normalized_endpoint, 12))');
    expect(migration).toContain('grant execute on function public.upsert_web_push_subscription');
  });

  it('leases jobs only to service role and rechecks recipient ownership', () => {
    expect(migration).toContain('for update of subscriptions skip locked');
    expect(migration).toContain('set attempt_count = deliveries.attempt_count + 1');
    expect(migration).toContain('deliveries.attempt_count >= 8');
    expect(migration).toContain('subscriptions.user_id = notifications.recipient_id');
    expect(migration).toContain('delivery_record.lease_token is distinct from lease_token_param');
    const completion = migration.indexOf('create or replace function public.complete_web_push_delivery(');
    const subscriptionLock = migration.indexOf('for update;', migration.indexOf('from public.web_push_subscriptions subscriptions', completion));
    const deliveryLock = migration.indexOf('for update;', migration.indexOf('from public.web_push_notification_deliveries deliveries', subscriptionLock));
    expect(subscriptionLock).toBeGreaterThan(completion);
    expect(deliveryLock).toBeGreaterThan(subscriptionLock);
    expect(migration).toContain('grant execute on function public.claim_web_push_deliveries(integer, uuid, integer, uuid) to service_role');
    expect(migration).not.toContain('grant execute on function public.claim_web_push_deliveries(integer, uuid, integer, uuid) to authenticated');
  });

  it('invalidates old-recipient work when ownership or subscription state changes', () => {
    expect(migration).toContain("last_error_code = 'subscription_owner_changed'");
    expect(migration).toContain("last_error_code = 'subscription_disabled'");
    expect(migration).toContain("last_error_code = 'subscription_expired'");
    expect(migration).toContain("outcome_param not in ('sent', 'invalid', 'retry', 'failed')");
  });
});
