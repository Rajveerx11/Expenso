'use strict';

const REFRESH_MESSAGE = 'EXPENSO_PUSH_RECEIVED';
const UUID_PATTERN = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const SAFE_HREF_PATTERN = new RegExp(`^/groups/${UUID_PATTERN}(?:/settlements/${UUID_PATTERN})?$`, 'i');

function safeHref(value) {
  return value === '/notifications' || (typeof value === 'string' && SAFE_HREF_PATTERN.test(value))
    ? value
    : '/notifications';
}

function text(value, fallback, maxLength) {
  return typeof value === 'string' && value.trim()
    ? value.trim().slice(0, maxLength)
    : fallback;
}

function pushPayload(eventData) {
  let value = {};
  try {
    value = eventData ? eventData.json() : {};
  } catch {
    value = {};
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) value = {};
  return {
    title: text(value.title, 'Expenso update', 120),
    body: text(value.body ?? value.message, 'Open Expenso to see what changed.', 240),
    href: safeHref(value.href),
    notificationId: typeof value.notificationId === 'string' && new RegExp(`^${UUID_PATTERN}$`, 'i').test(value.notificationId)
      ? value.notificationId
      : null,
  };
}

self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  event.waitUntil((async () => {
    const payload = pushPayload(event.data);
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of windows) {
      client.postMessage({ type: REFRESH_MESSAGE, notificationId: payload.notificationId });
    }

    const visibleInbox = windows.some((client) => {
      try {
        return client.visibilityState === 'visible' && new URL(client.url).pathname === '/notifications';
      } catch {
        return false;
      }
    });
    if (visibleInbox) return;

    await self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: '/icons/icon-192.png',
      badge: '/icons/badge-96.png',
      tag: payload.notificationId ? `expenso-${payload.notificationId}` : undefined,
      renotify: false,
      data: { href: payload.href, notificationId: payload.notificationId },
    });
  })());
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil((async () => {
    const href = safeHref(event.notification.data?.href);
    const target = new URL(href, self.location.origin);
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const exact = windows.find((client) => {
      try {
        return new URL(client.url).origin === self.location.origin && new URL(client.url).pathname === target.pathname;
      } catch {
        return false;
      }
    });
    if (exact) {
      await exact.focus();
      return;
    }

    const sameOrigin = windows.find((client) => {
      try { return new URL(client.url).origin === self.location.origin; } catch { return false; }
    });
    if (sameOrigin && 'navigate' in sameOrigin) {
      try {
        await sameOrigin.navigate(target.href);
        await sameOrigin.focus();
        return;
      } catch {
        // Fall through to opening a new same-origin window.
      }
    }
    await self.clients.openWindow(target.href);
  })());
});

self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil((async () => {
    let renewed = null;
    try {
      const keyResponse = await fetch('/api/v1/push-subscriptions/vapid-public-key', {
        credentials: 'same-origin',
        cache: 'no-store',
        headers: { Accept: 'application/json' },
      });
      if (!keyResponse.ok) return;
      const keyPayload = await keyResponse.json();
      const publicKey = keyPayload?.data?.publicKey;
      if (typeof publicKey !== 'string') return;
      const padding = '='.repeat((4 - (publicKey.length % 4)) % 4);
      const decoded = atob(`${publicKey}${padding}`.replace(/-/g, '+').replace(/_/g, '/'));
      const applicationServerKey = Uint8Array.from(decoded, (character) => character.charCodeAt(0));
      renewed = await self.registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey });

      const csrfResponse = await fetch('/api/v1/auth/csrf', {
        credentials: 'same-origin',
        cache: 'no-store',
        headers: { Accept: 'application/json' },
      });
      if (!csrfResponse.ok) throw new Error('CSRF setup failed.');
      const csrfPayload = await csrfResponse.json();
      const csrfToken = csrfPayload?.data?.csrfToken;
      if (typeof csrfToken !== 'string') throw new Error('CSRF setup failed.');

      const subscription = renewed.toJSON();
      const response = await fetch('/api/v1/push-subscriptions', {
        method: 'POST',
        credentials: 'same-origin',
        cache: 'no-store',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          'x-csrf-token': csrfToken,
        },
        body: JSON.stringify(subscription),
      });
      if (!response.ok) throw new Error('Subscription renewal failed.');
    } catch {
      if (renewed) await renewed.unsubscribe().catch(() => false);
    }
  })());
});
