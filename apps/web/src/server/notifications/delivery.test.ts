import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), send: vi.fn(), config: vi.fn() }));
vi.mock('@/server/supabase/admin', () => ({ createAdminClient: () => ({ rpc: mocks.rpc }) }));
vi.mock('@/server/config/env', () => ({
  getWebPushConfig: mocks.config,
}));
vi.mock('web-push', () => ({ default: { sendNotification: mocks.send } }));

import { classifyPushFailure, drainWebPushDeliveries, retryDelaySeconds, secretMatches } from './delivery';

const claim = {
  delivery_id: '00000000-0000-4000-8000-000000000001',
  notification_id: '00000000-0000-4000-8000-000000000002',
  endpoint: 'https://fcm.googleapis.com/fcm/send/token', p256dh: 'A'.repeat(65), auth: 'B'.repeat(22),
  type: 'expense_added', title: 'Expense', message: 'Added', href: '/groups/00000000-0000-4000-8000-000000000003',
  created_at: '2026-08-14T00:00:00Z', attempt_count: 1,
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.config.mockReturnValue({ publicKey: 'A'.repeat(87), privateKey: 'B'.repeat(43), subject: 'mailto:ops@example.com' });
  mocks.rpc.mockResolvedValueOnce({ data: [claim], error: null }).mockResolvedValue({ data: true, error: null });
});

describe('Web Push delivery', () => {
  it('validates VAPID configuration before consuming a delivery attempt', async () => {
    mocks.config.mockImplementationOnce(() => { throw new Error('missing'); });
    await expect(drainWebPushDeliveries()).rejects.toThrow('missing');
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('sends a minimal safe payload and completes its lease', async () => {
    mocks.send.mockResolvedValue({ statusCode: 201 });
    const result = await drainWebPushDeliveries(25, claim.notification_id);
    expect(result).toMatchObject({ claimed: 1, sent: 1 });
    expect(mocks.rpc).toHaveBeenNthCalledWith(1, 'claim_web_push_deliveries', expect.objectContaining({
      notification_id_param: claim.notification_id,
    }));
    const payload = JSON.parse(mocks.send.mock.calls[0][1]);
    expect(payload).toEqual(expect.objectContaining({ v: 1, notificationId: claim.notification_id, href: claim.href }));
    expect(JSON.stringify(payload)).not.toContain(claim.endpoint);
    expect(mocks.rpc).toHaveBeenLastCalledWith('complete_web_push_delivery', expect.objectContaining({ outcome_param: 'sent' }));
  });

  it('fans out a claimed batch concurrently within one serverless window', async () => {
    const second = { ...claim, delivery_id: '00000000-0000-4000-8000-000000000004' };
    mocks.rpc.mockReset();
    mocks.rpc.mockResolvedValueOnce({ data: [claim, second], error: null }).mockResolvedValue({ data: true, error: null });
    let release: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    mocks.send.mockImplementation(() => gate);
    const pending = drainWebPushDeliveries();
    await vi.waitFor(() => expect(mocks.send).toHaveBeenCalledTimes(2));
    release!();
    expect(await pending).toMatchObject({ claimed: 2, sent: 2 });
  });

  it.each([404, 410])('disables invalid subscription on HTTP %s', async (statusCode) => {
    mocks.send.mockRejectedValue({ statusCode, headers: {} });
    const result = await drainWebPushDeliveries();
    expect(result.invalid).toBe(1);
    expect(mocks.rpc).toHaveBeenLastCalledWith('complete_web_push_delivery', expect.objectContaining({ outcome_param: 'invalid' }));
  });

  it('refuses a forged worker endpoint before network access', async () => {
    mocks.rpc.mockReset();
    mocks.rpc.mockResolvedValueOnce({ data: [{ ...claim, endpoint: 'https://127.0.0.1/push' }], error: null })
      .mockResolvedValue({ data: true, error: null });
    expect(await drainWebPushDeliveries()).toMatchObject({ failed: 1, sent: 0 });
    expect(mocks.send).not.toHaveBeenCalled();
    expect(mocks.rpc).toHaveBeenLastCalledWith(
      'complete_web_push_delivery', expect.objectContaining({ outcome_param: 'failed', error_code_param: 'UNSAFE_PUSH_ENDPOINT' }),
    );
  });

  it('retries throttling and transient/configuration failures without invalidating subscription', () => {
    expect(classifyPushFailure(429, 1, '90')).toEqual({ outcome: 'retry', code: 'HTTP_429', retryAfterSeconds: 90 });
    expect(classifyPushFailure(503, 2)).toMatchObject({ outcome: 'retry', code: 'HTTP_503' });
    expect(classifyPushFailure(401, 2)).toMatchObject({ outcome: 'retry', code: 'HTTP_401' });
    expect(classifyPushFailure(undefined, 8)).toEqual({ outcome: 'failed', code: 'NETWORK_ERROR', retryAfterSeconds: null });
    expect(retryDelaySeconds(1, undefined, () => 0.5)).toBe(15);
  });

  it('compares internal bearer credentials without accepting missing secrets', () => {
    expect(secretMatches('Bearer correct-secret-value', 'correct-secret-value')).toBe(true);
    expect(secretMatches(null, 'correct-secret-value')).toBe(false);
    expect(secretMatches('Bearer wrong', 'correct-secret-value')).toBe(false);
  });
});
