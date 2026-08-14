import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import vm from 'node:vm';
import { describe, expect, it, vi } from 'vitest';

type WorkerEvent = { waitUntil: (promise: Promise<unknown>) => void };

function workerHarness(windows: Array<Record<string, unknown>> = []) {
  const listeners = new Map<string, (event: never) => void>();
  const showNotification = vi.fn().mockResolvedValue(undefined);
  const openWindow = vi.fn().mockResolvedValue(undefined);
  const scope = {
    location: { origin: 'https://expenso.example' },
    skipWaiting: vi.fn().mockResolvedValue(undefined),
    registration: {
      showNotification,
      pushManager: { subscribe: vi.fn() },
    },
    clients: {
      claim: vi.fn().mockResolvedValue(undefined),
      matchAll: vi.fn().mockResolvedValue(windows),
      openWindow,
    },
    addEventListener: (name: string, listener: (event: never) => void) => { listeners.set(name, listener); },
  };
  const source = readFileSync(resolve(process.cwd(), 'public/sw.js'), 'utf8');
  vm.runInNewContext(source, {
    self: scope,
    URL,
    RegExp,
    Uint8Array,
    fetch: vi.fn(),
    atob: (value: string) => Buffer.from(value, 'base64').toString('binary'),
  });
  return { listeners, showNotification, openWindow };
}

async function dispatch(listener: ((event: never) => void) | undefined, event: Record<string, unknown>): Promise<void> {
  if (!listener) throw new Error('Missing worker listener.');
  let completion: Promise<unknown> = Promise.resolve();
  listener({ ...event, waitUntil: (promise: Promise<unknown>) => { completion = promise; } } as never);
  await completion;
}

describe('Expenso service worker', () => {
  it('shows a bounded notification and replaces unsafe destinations', async () => {
    const harness = workerHarness();
    await dispatch(harness.listeners.get('push'), {
      data: { json: () => ({ title: 'T'.repeat(200), message: 'Changed', href: '//evil.example' }) },
    } satisfies Omit<WorkerEvent, 'waitUntil'>);
    expect(harness.showNotification).toHaveBeenCalledWith('T'.repeat(120), expect.objectContaining({
      body: 'Changed',
      data: { href: '/notifications', notificationId: null },
    }));
  });

  it('refreshes a visible inbox without showing a duplicate system notification', async () => {
    const postMessage = vi.fn();
    const harness = workerHarness([{
      url: 'https://expenso.example/notifications',
      visibilityState: 'visible',
      postMessage,
    }]);
    await dispatch(harness.listeners.get('push'), {
      data: { json: () => ({ title: 'Update', href: '/notifications' }) },
    });
    expect(postMessage).toHaveBeenCalledWith(expect.objectContaining({ type: 'EXPENSO_PUSH_RECEIVED' }));
    expect(harness.showNotification).not.toHaveBeenCalled();
  });

  it('still shows a system notification when another app page is visible', async () => {
    const harness = workerHarness([{
      url: 'https://expenso.example/dashboard',
      visibilityState: 'visible',
      postMessage: vi.fn(),
    }]);
    await dispatch(harness.listeners.get('push'), {
      data: { json: () => ({ title: 'Update', href: '/notifications' }) },
    });
    expect(harness.showNotification).toHaveBeenCalledOnce();
  });

  it('focuses an existing safe destination and never follows an external click URL', async () => {
    const focus = vi.fn().mockResolvedValue(undefined);
    const harness = workerHarness([{
      url: 'https://expenso.example/notifications',
      visibilityState: 'hidden',
      postMessage: vi.fn(),
      focus,
    }]);
    const close = vi.fn();
    await dispatch(harness.listeners.get('notificationclick'), {
      notification: { close, data: { href: 'https://evil.example/phish' } },
    });
    expect(close).toHaveBeenCalledOnce();
    expect(focus).toHaveBeenCalledOnce();
    expect(harness.openWindow).not.toHaveBeenCalled();
  });
});
