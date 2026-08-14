'use strict';

const FALLBACK_HREF = '/notifications';
const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const SAFE_HREF = new RegExp(`^/groups/${UUID}(?:/settlements/${UUID})?$`, 'i');

function hrefFor(value) {
  return value === FALLBACK_HREF || SAFE_HREF.test(String(value)) ? String(value) : FALLBACK_HREF;
}

self.addEventListener('push', (event) => {
  event.waitUntil((async () => {
    let payload = {};
    try { payload = event.data ? event.data.json() : {}; } catch { payload = {}; }
    const notificationId = /^[0-9a-f-]{36}$/i.test(String(payload.notificationId))
      ? String(payload.notificationId) : crypto.randomUUID();
    const href = hrefFor(payload.href);
    const visibleClients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const visible = visibleClients.find((client) => client.visibilityState === 'visible');
    if (visible) {
      visible.postMessage({ type: 'EXPENSO_PUSH', notificationId, href });
      return;
    }
    await self.registration.showNotification(String(payload.title || 'Expenso update').slice(0, 120), {
      body: String(payload.message || 'Open Expenso for details.').slice(0, 300),
      tag: `expenso:${notificationId}`,
      data: { notificationId, href },
    });
  })());
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil((async () => {
    const href = hrefFor(event.notification.data?.href);
    const target = new URL(href, self.location.origin);
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const exact = windows.find((client) => new URL(client.url).pathname === target.pathname);
    if (exact) return exact.focus();
    const existing = windows[0];
    if (existing && 'navigate' in existing) {
      await existing.navigate(target.href);
      return existing.focus();
    }
    return self.clients.openWindow(target.href);
  })());
});
