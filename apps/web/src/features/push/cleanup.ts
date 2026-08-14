'use client';

import { api } from '@/lib/api/client';
import {
  clearStoredPushSubscription,
  readStoredPushSubscription,
} from './browser';

interface PushCleanupDependencies {
  storage: Pick<Storage, 'getItem' | 'removeItem'>;
  unsubscribeServer: (subscriptionId: string) => Promise<unknown>;
  getBrowserSubscription: () => Promise<Pick<PushSubscription, 'unsubscribe'> | null>;
  timeoutMs?: number;
}

export async function cleanupPushSubscription({
  storage,
  unsubscribeServer,
  getBrowserSubscription,
  timeoutMs = 1_500,
}: PushCleanupDependencies): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const stored = readStoredPushSubscription(storage);
    const tasks: Promise<unknown>[] = [];
    if (stored?.id) {
      tasks.push(Promise.resolve().then(() => unsubscribeServer(stored.id)).catch(() => undefined));
    }
    tasks.push(
      Promise.resolve()
        .then(getBrowserSubscription)
        .then((subscription) => subscription?.unsubscribe())
        .catch(() => undefined),
    );
    await Promise.race([
      Promise.allSettled(tasks),
      new Promise<void>((resolve) => { timer = setTimeout(resolve, timeoutMs); }),
    ]);
  } catch {
    // Logout must continue even if browser push cleanup cannot run.
  } finally {
    if (timer) clearTimeout(timer);
    clearStoredPushSubscription(storage);
  }
}

export async function bestEffortDisableCurrentPush(): Promise<void> {
  if (typeof window === 'undefined') return;
  await cleanupPushSubscription({
    storage: localStorage,
    unsubscribeServer: api.notifications.unsubscribe,
    getBrowserSubscription: async () => {
      if (!('serviceWorker' in navigator)) return null;
      const registration = await navigator.serviceWorker.getRegistration('/');
      return registration?.pushManager.getSubscription() ?? null;
    },
  });
}
