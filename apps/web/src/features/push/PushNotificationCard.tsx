'use client';

import { useEffect, useState } from 'react';
import { BellOff, BellRing, ShieldCheck } from 'lucide-react';
import { PrimaryButton, SecondaryButton } from '@/components/ui/Buttons';
import { api, messageForError } from '@/lib/api/client';
import {
  clearStoredPushSubscription,
  decodeBase64Url,
  hasWebPushSupport,
  isIosDevice,
  isStandaloneApp,
  readyPushRegistration,
  readStoredPushSubscription,
  serializePushSubscription,
  subscriptionUsesKey,
  writeStoredPushSubscription,
} from './browser';

type PushStatus = 'checking' | 'available' | 'enabled' | 'blocked' | 'unsupported' | 'error' | 'cleanup';

export class PushCleanupError extends Error {
  readonly serverFailed: boolean;
  readonly retryCleanup: () => Promise<void>;

  constructor(cause: unknown, serverFailed: boolean, retryCleanup: () => Promise<void>) {
    super(cause instanceof Error ? cause.message : 'Push cleanup failed.');
    this.name = 'PushCleanupError';
    this.serverFailed = serverFailed;
    this.retryCleanup = retryCleanup;
  }
}

interface ReconcilePushSubscriptionOptions {
  registration: ServiceWorkerRegistration;
  current: PushSubscription | null;
  storedServerId: string | null;
  loadIdentity: () => Promise<{ applicationServerKey: Uint8Array<ArrayBuffer>; userId: string }>;
  saveSubscription: (subscription: PushSubscriptionJSON & { userAgent: string | null }) => Promise<{ id: string }>;
  deleteSubscription: (subscriptionId: string) => Promise<unknown>;
  userAgent: string | null;
}

export async function reconcilePushSubscription({
  registration,
  current,
  storedServerId,
  loadIdentity,
  saveSubscription,
  deleteSubscription,
  userAgent,
}: ReconcilePushSubscriptionOptions): Promise<{ subscription: PushSubscription; serverSubscriptionId: string; userId: string }> {
  const { applicationServerKey, userId } = await loadIdentity();
  let active = current;
  let rollback: PushSubscription | null = null;

  if (active && !subscriptionUsesKey(active, applicationServerKey)) {
    if (storedServerId) await deleteSubscription(storedServerId).catch(() => undefined);
    await active.unsubscribe();
    active = null;
  }

  if (!active) {
    active = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey });
    rollback = active;
  }

  try {
    const saved = await saveSubscription(serializePushSubscription(active, userAgent));
    return { subscription: active, serverSubscriptionId: saved.id, userId };
  } catch (error) {
    if (rollback) await rollback.unsubscribe().catch(() => false);
    throw error;
  }
}

interface DisablePushSubscriptionOptions {
  current: PushSubscription | null;
  serverSubscriptionId: string | null;
  saveSubscription: (subscription: PushSubscriptionJSON & { userAgent: string | null }) => Promise<{ id: string }>;
  deleteSubscription: (subscriptionId: string) => Promise<unknown>;
  clearLocalSummary: () => void;
  userAgent: string | null;
}

export async function disablePushSubscription({
  current,
  serverSubscriptionId,
  saveSubscription,
  deleteSubscription,
  clearLocalSummary,
  userAgent,
}: DisablePushSubscriptionOptions): Promise<void> {
  let resolvedServerId = serverSubscriptionId;
  const cleanupServer = async () => {
    if (!resolvedServerId && current) {
      const saved = await saveSubscription(serializePushSubscription(current, userAgent));
      resolvedServerId = saved.id;
    }
    if (resolvedServerId) await deleteSubscription(resolvedServerId);
  };
  const cleanupBrowser = async () => {
    if (current) await current.unsubscribe();
  };

  let serverError: unknown;
  try {
    await cleanupServer();
  } catch (error) {
    serverError = error;
  }

  let browserError: unknown;
  try {
    await cleanupBrowser();
  } catch (error) {
    browserError = error;
  } finally {
    clearLocalSummary();
  }

  if (serverError || browserError) {
    const retryCleanup = async () => {
      let retryServerError: unknown;
      let retryBrowserError: unknown;
      if (serverError) {
        try { await cleanupServer(); } catch (error) { retryServerError = error; }
      }
      if (browserError) {
        try { await cleanupBrowser(); } catch (error) { retryBrowserError = error; }
      }
      if (retryServerError) throw retryServerError;
      if (retryBrowserError) throw retryBrowserError;
    };
    throw new PushCleanupError(serverError ?? browserError, Boolean(serverError), retryCleanup);
  }
}

export function PushStatusAction({
  status,
  isSaving,
  onEnable,
  onDisable,
  onRetryCleanup,
}: {
  status: PushStatus;
  isSaving: boolean;
  onEnable: () => void;
  onDisable: () => void;
  onRetryCleanup: () => void;
}) {
  if (status === 'cleanup') {
    return <SecondaryButton type="button" size="sm" loading={isSaving} onClick={onRetryCleanup} style={{ marginTop: 12 }}>Retry cleanup</SecondaryButton>;
  }
  if (status === 'available' || status === 'error') {
    return (
      <PrimaryButton type="button" size="sm" loading={isSaving} onClick={onEnable} style={{ marginTop: 12 }}>
        {status === 'error' ? 'Try again' : 'Turn on'}
      </PrimaryButton>
    );
  }
  if (status === 'enabled') {
    return <SecondaryButton type="button" size="sm" loading={isSaving} onClick={onDisable} style={{ marginTop: 12 }}>Turn off</SecondaryButton>;
  }
  return null;
}

function browserPushError(error: unknown): string {
  if (error instanceof DOMException && error.name === 'NotAllowedError') {
    return 'Notification permission was not granted.';
  }
  if (error instanceof Error && error.message === 'Browser returned an incomplete push subscription.') {
    return 'This browser returned an invalid notification subscription. Try another browser.';
  }
  return messageForError(error);
}

function supportMessage(): string {
  if (!window.isSecureContext) return 'Notifications require a secure HTTPS connection.';
  if (isIosDevice(navigator.userAgent) && !isStandaloneApp()) {
    return 'On iPhone or iPad, add Expenso to the Home Screen first, then open the installed app.';
  }
  return 'This browser does not support web notifications.';
}

export function PushNotificationCard() {
  const [status, setStatus] = useState<PushStatus>('checking');
  const [subscription, setSubscription] = useState<PushSubscription | null>(null);
  const [serverSubscriptionId, setServerSubscriptionId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [cleanupRetry, setCleanupRetry] = useState<(() => Promise<void>) | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [unsupportedMessage, setUnsupportedMessage] = useState('This browser does not support web notifications.');

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (!hasWebPushSupport()) {
        if (!cancelled) {
          setUnsupportedMessage(supportMessage());
          setStatus('unsupported');
        }
        return;
      }

      try {
        const registration = await readyPushRegistration();
        const current = await registration.pushManager.getSubscription();
        if (cancelled) return;
        const stored = readStoredPushSubscription(localStorage);
        if (Notification.permission === 'denied') {
          if (stored?.id) await api.notifications.unsubscribe(stored.id).catch(() => undefined);
          if (current) await current.unsubscribe().catch(() => false);
          clearStoredPushSubscription(localStorage);
          if (!cancelled) {
            setSubscription(null);
            setServerSubscriptionId(null);
            setStatus('blocked');
          }
          return;
        }

        if (!current) {
          clearStoredPushSubscription(localStorage);
          setSubscription(null);
          setServerSubscriptionId(null);
          setStatus('available');
          return;
        }

        const reconciled = await reconcilePushSubscription({
          registration,
          current,
          storedServerId: stored?.id ?? null,
          loadIdentity: async () => {
            const [profile, publicKey] = await Promise.all([
              api.profile.get(),
              api.notifications.vapidPublicKey(),
            ]);
            return { applicationServerKey: decodeBase64Url(publicKey), userId: profile.id };
          },
          saveSubscription: api.notifications.subscribe,
          deleteSubscription: api.notifications.unsubscribe,
          userAgent: navigator.userAgent || null,
        });
        if (cancelled) return;
        writeStoredPushSubscription(localStorage, {
          id: reconciled.serverSubscriptionId,
          userId: reconciled.userId,
        });
        setSubscription(reconciled.subscription);
        setServerSubscriptionId(reconciled.serverSubscriptionId);
        setStatus('enabled');
      } catch (error) {
        if (!cancelled) {
          setErrorMessage(browserPushError(error));
          setStatus('error');
        }
      }
    })();
    return () => { cancelled = true; };
  }, []);

  async function enablePush() {
    if (!hasWebPushSupport()) return;
    setIsSaving(true);
    setErrorMessage(null);
    setCleanupRetry(null);
    try {
      const permission = Notification.permission === 'default'
        ? await Notification.requestPermission()
        : Notification.permission;
      if (permission !== 'granted') {
        setStatus('blocked');
        return;
      }

      const registration = await readyPushRegistration();
      let current = await registration.pushManager.getSubscription();
      const storedServerId = serverSubscriptionId ?? readStoredPushSubscription(localStorage)?.id ?? null;
      const reconciled = await reconcilePushSubscription({
        registration,
        current,
        storedServerId,
        loadIdentity: async () => {
          const [publicKey, profile] = await Promise.all([
            api.notifications.vapidPublicKey(),
            api.profile.get(),
          ]);
          return { applicationServerKey: decodeBase64Url(publicKey), userId: profile.id };
        },
        saveSubscription: api.notifications.subscribe,
        deleteSubscription: api.notifications.unsubscribe,
        userAgent: navigator.userAgent || null,
      });
      current = reconciled.subscription;
      writeStoredPushSubscription(localStorage, {
        id: reconciled.serverSubscriptionId,
        userId: reconciled.userId,
      });
      setServerSubscriptionId(reconciled.serverSubscriptionId);
      setSubscription(current);
      setStatus('enabled');
    } catch (error) {
      setErrorMessage(browserPushError(error));
      setStatus('error');
    } finally {
      setIsSaving(false);
    }
  }

  async function disablePush() {
    if (!hasWebPushSupport()) return;
    setIsSaving(true);
    setErrorMessage(null);
    try {
      const current = subscription ?? await (await readyPushRegistration()).pushManager.getSubscription();
      const subscriptionId = serverSubscriptionId ?? readStoredPushSubscription(localStorage)?.id ?? null;
      await disablePushSubscription({
        current,
        serverSubscriptionId: subscriptionId,
        saveSubscription: api.notifications.subscribe,
        deleteSubscription: api.notifications.unsubscribe,
        clearLocalSummary: () => clearStoredPushSubscription(localStorage),
        userAgent: navigator.userAgent || null,
      });
      setServerSubscriptionId(null);
      setSubscription(null);
      setStatus('available');
    } catch (error) {
      clearStoredPushSubscription(localStorage);
      setServerSubscriptionId(null);
      setSubscription(null);
      if (error instanceof PushCleanupError) {
        setCleanupRetry(() => error.retryCleanup);
        setErrorMessage(error.serverFailed
          ? 'Notifications are off on this browser, but server cleanup could not finish.'
          : 'Notifications may still be active in this browser. Cleanup could not finish.');
        setStatus('cleanup');
      } else {
        setErrorMessage(browserPushError(error));
        setStatus('error');
      }
    } finally {
      setIsSaving(false);
    }
  }

  async function retryPushCleanup() {
    if (!cleanupRetry) return;
    setIsSaving(true);
    try {
      await cleanupRetry();
      setCleanupRetry(null);
      setErrorMessage(null);
      setStatus('available');
    } catch {
      setErrorMessage('Notifications are off on this browser, but server cleanup could not finish.');
      setStatus('cleanup');
    } finally {
      setIsSaving(false);
    }
  }

  const description = status === 'checking'
    ? 'Checking notification support…'
    : status === 'enabled'
      ? 'This browser receives group, expense, and settlement updates.'
      : status === 'blocked'
        ? 'Notifications are blocked. Allow them in browser site settings, then reload.'
        : status === 'unsupported'
          ? unsupportedMessage
          : status === 'cleanup'
            ? errorMessage ?? 'Notifications are off, but cleanup still needs attention.'
          : status === 'error'
            ? errorMessage ?? 'Couldn’t update browser notifications.'
            : 'Get group, expense, and settlement updates even when Expenso is closed.';

  return (
    <section className="card" aria-labelledby="push-notification-heading" style={{ padding: 16 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        <div
          aria-hidden="true"
          style={{
            width: 42,
            height: 42,
            borderRadius: 14,
            background: status === 'enabled' ? 'var(--color-green-soft)' : 'var(--color-primary-lightest)',
            color: status === 'enabled' ? 'var(--color-green)' : 'var(--color-primary-deep)',
            display: 'grid',
            placeItems: 'center',
            flexShrink: 0,
          }}
        >
          {status === 'enabled' ? <ShieldCheck size={21} /> : status === 'blocked' || status === 'cleanup' ? <BellOff size={21} /> : <BellRing size={21} />}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <h2 id="push-notification-heading" style={{ fontSize: 15, fontWeight: 700, color: 'var(--color-black)' }}>
              Browser notifications
            </h2>
            {status === 'enabled' && (
              <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-green)', background: 'var(--color-green-soft)', padding: '4px 8px', borderRadius: 999 }}>
                On
              </span>
            )}
          </div>
          <p aria-live="polite" style={{ marginTop: 5, color: status === 'error' || status === 'cleanup' ? 'var(--color-red)' : 'var(--color-medium)', fontSize: 13, lineHeight: 1.5 }}>
            {description}
          </p>
          <PushStatusAction
            status={status}
            isSaving={isSaving}
            onEnable={() => void enablePush()}
            onDisable={() => void disablePush()}
            onRetryCleanup={() => void retryPushCleanup()}
          />
        </div>
      </div>
    </section>
  );
}
