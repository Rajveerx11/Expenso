import { describe, expect, it, vi } from 'vitest';
import { PUSH_SUBSCRIPTION_STORAGE_KEY } from './browser';
import { cleanupPushSubscription } from './cleanup';

const subscriptionId = '00000000-0000-4000-8000-000000000001';
const userId = '00000000-0000-4000-8000-000000000002';

function storageWithSummary() {
  const values = new Map([[PUSH_SUBSCRIPTION_STORAGE_KEY, JSON.stringify({ id: subscriptionId, userId })]]);
  return {
    getItem: (key: string) => values.get(key) ?? null,
    removeItem: (key: string) => { values.delete(key); },
  };
}

describe('push logout cleanup', () => {
  it('disables both server and browser subscriptions, then clears local summary', async () => {
    const storage = storageWithSummary();
    const unsubscribeServer = vi.fn().mockResolvedValue(undefined);
    const unsubscribeBrowser = vi.fn().mockResolvedValue(true);
    await cleanupPushSubscription({
      storage,
      unsubscribeServer,
      getBrowserSubscription: vi.fn().mockResolvedValue({ unsubscribe: unsubscribeBrowser }),
      timeoutMs: 20,
    });
    expect(unsubscribeServer).toHaveBeenCalledWith(subscriptionId);
    expect(unsubscribeBrowser).toHaveBeenCalledOnce();
    expect(storage.getItem(PUSH_SUBSCRIPTION_STORAGE_KEY)).toBeNull();
  });

  it('never throws or retains identifiers when either cleanup operation fails', async () => {
    const storage = storageWithSummary();
    await expect(cleanupPushSubscription({
      storage,
      unsubscribeServer: vi.fn().mockRejectedValue(new Error('offline')),
      getBrowserSubscription: vi.fn().mockRejectedValue(new Error('browser failure')),
      timeoutMs: 20,
    })).resolves.toBeUndefined();
    expect(storage.getItem(PUSH_SUBSCRIPTION_STORAGE_KEY)).toBeNull();
  });
});
