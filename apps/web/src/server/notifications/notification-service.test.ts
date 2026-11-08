import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { listNotifications, upsertWebPushSubscription } from './notification-service';

describe('notification service', () => {
  it('normalizes inbox rows and falls back from unsafe href values', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [{
      id: '00000000-0000-4000-8000-000000000001', type: 'expense_added', title: 'Expense', message: 'Added',
      group_id: null, related_id: null, href: 'javascript:alert(1)', is_read: false, created_at: '2026-08-14T00:00:00Z',
    }], error: null });
    const result = await listNotifications({ rpc } as unknown as SupabaseClient, { limit: 50 });
    expect(result.notifications[0]).toMatchObject({ href: '/notifications', isRead: false });
  });

  it('never returns endpoint or encryption key material', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [{
      id: '00000000-0000-4000-8000-000000000002', expiration_time: null,
      user_agent: 'Browser', created_at: '2026-08-14T00:00:00Z', last_success_at: null,
      endpoint: 'secret-endpoint', p256dh: 'secret-key', auth: 'secret-auth',
    }], error: null });
    const result = await upsertWebPushSubscription({ rpc } as unknown as SupabaseClient, {
      endpoint: 'https://fcm.googleapis.com/fcm/send/token', expirationTime: null,
      keys: { p256dh: 'A'.repeat(65), auth: 'B'.repeat(22) }, userAgent: 'Browser',
    });
    expect(result).not.toHaveProperty('endpoint');
    expect(JSON.stringify(result)).not.toContain('secret');
  });

  it('maps the durable per-user subscription cap to stable throttling', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: null, error: { code: 'P0001', message: 'WEB_PUSH_SUBSCRIPTION_LIMIT' },
    });
    await expect(upsertWebPushSubscription({ rpc } as unknown as SupabaseClient, {
      endpoint: 'https://fcm.googleapis.com/fcm/send/token', expirationTime: null,
      keys: { p256dh: 'A'.repeat(65), auth: 'B'.repeat(22) },
    })).rejects.toMatchObject({ code: 'RATE_LIMITED', status: 429 });
  });

  it('maps a leased endpoint transfer to a retryable conflict', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: null, error: { code: '40001', message: 'WEB_PUSH_ENDPOINT_BUSY' },
    });
    await expect(upsertWebPushSubscription({ rpc } as unknown as SupabaseClient, {
      endpoint: 'https://fcm.googleapis.com/fcm/send/token', expirationTime: null,
      keys: { p256dh: 'A'.repeat(65), auth: 'B'.repeat(22) },
    })).rejects.toMatchObject({ code: 'CONFLICT', status: 409, retryable: true });
  });
});
