import { createElement, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import {
  disablePushSubscription,
  PushCleanupError,
  PushStatusAction,
  reconcilePushSubscription,
} from './PushNotificationCard';

const serverSubscriptionId = '00000000-0000-4000-8000-000000000001';
const userId = '00000000-0000-4000-8000-000000000002';

function pushSubscription(key: number[], endpoint = 'https://push.example/subscription') {
  const unsubscribe = vi.fn().mockResolvedValue(true);
  const subscription = {
    endpoint,
    expirationTime: null,
    options: { applicationServerKey: Uint8Array.from(key).buffer },
    unsubscribe,
    toJSON: () => ({
      endpoint,
      expirationTime: null,
      keys: { p256dh: 'p256dh', auth: 'auth' },
    }),
  } as unknown as PushSubscription;
  return { subscription, unsubscribe };
}

function registrationReturning(subscription: PushSubscription) {
  const subscribe = vi.fn().mockResolvedValue(subscription);
  return {
    registration: { pushManager: { subscribe } } as unknown as ServiceWorkerRegistration,
    subscribe,
  };
}

describe('push subscription reconciliation', () => {
  it('preserves an existing same-key browser subscription across identity and upsert failures', async () => {
    const identityFailure = pushSubscription([1, 2, 3]);
    const identityRegistration = registrationReturning(identityFailure.subscription);

    await expect(reconcilePushSubscription({
      registration: identityRegistration.registration,
      current: identityFailure.subscription,
      storedServerId: serverSubscriptionId,
      loadIdentity: vi.fn().mockRejectedValue(new Error('VAPID unavailable')),
      saveSubscription: vi.fn(),
      deleteSubscription: vi.fn(),
      userAgent: 'Test Browser',
    })).rejects.toThrow('VAPID unavailable');

    expect(identityFailure.unsubscribe).not.toHaveBeenCalled();
    expect(identityRegistration.subscribe).not.toHaveBeenCalled();

    const upsertFailure = pushSubscription([1, 2, 3]);
    const upsertRegistration = registrationReturning(upsertFailure.subscription);
    await expect(reconcilePushSubscription({
      registration: upsertRegistration.registration,
      current: upsertFailure.subscription,
      storedServerId: serverSubscriptionId,
      loadIdentity: vi.fn().mockResolvedValue({
        applicationServerKey: Uint8Array.from([1, 2, 3]),
        userId,
      }),
      saveSubscription: vi.fn().mockRejectedValue(new Error('upsert unavailable')),
      deleteSubscription: vi.fn(),
      userAgent: 'Test Browser',
    })).rejects.toThrow('upsert unavailable');

    expect(upsertFailure.unsubscribe).not.toHaveBeenCalled();
    expect(upsertRegistration.subscribe).not.toHaveBeenCalled();
  });

  it('recovers from a VAPID mismatch even when deleting the stale server ID fails', async () => {
    const stale = pushSubscription([1, 2, 3], 'https://push.example/stale');
    const replacement = pushSubscription([4, 5, 6], 'https://push.example/replacement');
    const { registration, subscribe } = registrationReturning(replacement.subscription);
    const deleteSubscription = vi.fn().mockRejectedValue(new Error('stale ID not found'));
    const saveSubscription = vi.fn().mockResolvedValue({ id: serverSubscriptionId });

    const result = await reconcilePushSubscription({
      registration,
      current: stale.subscription,
      storedServerId: serverSubscriptionId,
      loadIdentity: vi.fn().mockResolvedValue({
        applicationServerKey: Uint8Array.from([4, 5, 6]),
        userId,
      }),
      saveSubscription,
      deleteSubscription,
      userAgent: 'Test Browser',
    });

    expect(deleteSubscription).toHaveBeenCalledWith(serverSubscriptionId);
    expect(stale.unsubscribe).toHaveBeenCalledOnce();
    expect(subscribe).toHaveBeenCalledOnce();
    expect(saveSubscription).toHaveBeenCalledOnce();
    expect(replacement.unsubscribe).not.toHaveBeenCalled();
    expect(result.subscription).toBe(replacement.subscription);
  });
});

describe('push subscription disable', () => {
  it.each([
    ['stale server ID', serverSubscriptionId, 'delete'],
    ['offline server lookup', null, 'save'],
  ] as const)('removes browser and local state despite %s failure', async (_name, storedId, failurePoint) => {
    const current = pushSubscription([1, 2, 3]);
    const failure = new Error(failurePoint === 'delete' ? 'subscription not found' : 'network offline');
    const saveSubscription = failurePoint === 'save'
      ? vi.fn().mockRejectedValueOnce(failure).mockResolvedValue({ id: serverSubscriptionId })
      : vi.fn().mockResolvedValue({ id: serverSubscriptionId });
    const deleteSubscription = failurePoint === 'delete'
      ? vi.fn().mockRejectedValueOnce(failure).mockResolvedValue(undefined)
      : vi.fn().mockResolvedValue(undefined);
    const clearLocalSummary = vi.fn();

    const cleanupError = await disablePushSubscription({
      current: current.subscription,
      serverSubscriptionId: storedId,
      saveSubscription,
      deleteSubscription,
      clearLocalSummary,
      userAgent: 'Test Browser',
    }).catch((error: unknown) => error);

    expect(cleanupError).toBeInstanceOf(PushCleanupError);
    expect(current.unsubscribe).toHaveBeenCalledOnce();
    expect(clearLocalSummary).toHaveBeenCalledOnce();

    await (cleanupError as PushCleanupError).retryCleanup();
    expect(current.unsubscribe).toHaveBeenCalledOnce();
    expect(deleteSubscription).toHaveBeenCalledTimes(failurePoint === 'delete' ? 2 : 1);
    expect(saveSubscription).toHaveBeenCalledTimes(failurePoint === 'save' ? 2 : 0);
  });

  it('renders cleanup retry without an enable action after local disable succeeds', () => {
    const onEnable = vi.fn();
    const onRetryCleanup = vi.fn();
    const action = PushStatusAction({
      status: 'cleanup',
      isSaving: false,
      onEnable,
      onDisable: vi.fn(),
      onRetryCleanup,
    }) as ReactElement<{ onClick: () => void }>;
    const html = renderToStaticMarkup(createElement(PushStatusAction, {
      status: 'cleanup', isSaving: false, onEnable, onDisable: vi.fn(), onRetryCleanup,
    }));

    expect(html).toContain('Retry cleanup');
    expect(html).not.toContain('Turn on');
    expect(html).not.toContain('Turn off');
    action.props.onClick();
    expect(onRetryCleanup).toHaveBeenCalledOnce();
    expect(onEnable).not.toHaveBeenCalled();
  });
});
