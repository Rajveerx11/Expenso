import { describe, expect, it } from 'vitest';
import {
  PUSH_REFRESH_MESSAGE,
  PUSH_SUBSCRIPTION_STORAGE_KEY,
  clearStoredPushSubscription,
  decodeBase64Url,
  isIosDevice,
  isPushRefreshMessage,
  readStoredPushSubscription,
  serializePushSubscription,
  subscriptionUsesKey,
  writeStoredPushSubscription,
} from './browser';

const subscriptionId = '00000000-0000-4000-8000-000000000001';
const userId = '00000000-0000-4000-8000-000000000002';

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); },
  };
}

describe('browser push helpers', () => {
  it('decodes URL-safe VAPID material and rejects malformed input', () => {
    const decoded = decodeBase64Url('SGVsbG8td29ybGQ', (value) => Buffer.from(value, 'base64').toString('binary'));
    expect(Buffer.from(decoded).toString()).toBe('Hello-world');
    expect(() => decodeBase64Url('bad+key', () => '')).toThrow('Invalid base64url value.');
  });

  it('compares the browser subscription application key byte-for-byte', () => {
    const subscription = { options: { applicationServerKey: Uint8Array.from([1, 2, 3]).buffer } } as unknown as PushSubscription;
    expect(subscriptionUsesKey(subscription, Uint8Array.from([1, 2, 3]))).toBe(true);
    expect(subscriptionUsesKey(subscription, Uint8Array.from([1, 2, 4]))).toBe(false);
  });

  it('serializes only complete browser subscription fields', () => {
    const subscription = {
      endpoint: 'https://push.example/subscription',
      expirationTime: null,
      toJSON: () => ({ endpoint: 'ignored', expirationTime: null, keys: { p256dh: 'A'.repeat(43), auth: 'B'.repeat(16) } }),
    } as unknown as PushSubscription;
    expect(serializePushSubscription(subscription, 'Test Browser')).toEqual({
      endpoint: 'https://push.example/subscription',
      expirationTime: null,
      keys: { p256dh: 'A'.repeat(43), auth: 'B'.repeat(16) },
      userAgent: 'Test Browser',
    });
    expect(() => serializePushSubscription({ ...subscription, toJSON: () => ({}) } as unknown as PushSubscription, null))
      .toThrow('incomplete');
  });

  it('persists only validated summary identifiers and clears them', () => {
    const storage = memoryStorage();
    writeStoredPushSubscription(storage, { id: subscriptionId, userId });
    expect(readStoredPushSubscription(storage)).toEqual({ id: subscriptionId, userId });
    storage.setItem(PUSH_SUBSCRIPTION_STORAGE_KEY, JSON.stringify({ id: subscriptionId }));
    expect(readStoredPushSubscription(storage)).toEqual({ id: subscriptionId, userId: null });
    storage.setItem(PUSH_SUBSCRIPTION_STORAGE_KEY, JSON.stringify({ id: '//evil', userId }));
    expect(readStoredPushSubscription(storage)).toBeNull();
    clearStoredPushSubscription(storage);
    expect(storage.getItem(PUSH_SUBSCRIPTION_STORAGE_KEY)).toBeNull();
  });

  it('identifies iOS guidance and trusted worker refresh messages', () => {
    expect(isIosDevice('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)')).toBe(true);
    expect(isIosDevice('Mozilla/5.0 (Windows NT 10.0; Win64; x64)')).toBe(false);
    expect(isPushRefreshMessage({ type: PUSH_REFRESH_MESSAGE })).toBe(true);
    expect(isPushRefreshMessage({ type: 'other' })).toBe(false);
  });
});
