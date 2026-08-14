export const PUSH_SUBSCRIPTION_STORAGE_KEY = 'expenso.push-subscription.v1';
export const PUSH_REFRESH_MESSAGE = 'EXPENSO_PUSH_RECEIVED';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface StoredPushSubscription {
  id: string;
  userId: string | null;
}

export function decodeBase64Url(value: string, decode: (encoded: string) => string = atob): Uint8Array<ArrayBuffer> {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error('Invalid base64url value.');
  const padding = '='.repeat((4 - (value.length % 4)) % 4);
  const decoded = decode(`${value}${padding}`.replace(/-/g, '+').replace(/_/g, '/'));
  const output = new Uint8Array(new ArrayBuffer(decoded.length));
  for (let index = 0; index < decoded.length; index += 1) output[index] = decoded.charCodeAt(index);
  return output;
}

export function subscriptionUsesKey(subscription: PushSubscription, expected: Uint8Array): boolean {
  const current = subscription.options.applicationServerKey;
  if (!current) return false;
  const bytes = new Uint8Array(current);
  return bytes.length === expected.length && bytes.every((value, index) => value === expected[index]);
}

export function serializePushSubscription(
  subscription: PushSubscription,
  userAgent: string | null,
): PushSubscriptionJSON & { userAgent: string | null } {
  const json = subscription.toJSON();
  const p256dh = json.keys?.p256dh;
  const auth = json.keys?.auth;
  if (!subscription.endpoint || !p256dh || !auth) throw new Error('Browser returned an incomplete push subscription.');
  return {
    endpoint: subscription.endpoint,
    expirationTime: subscription.expirationTime,
    keys: { p256dh, auth },
    userAgent,
  };
}

export function readStoredPushSubscription(storage: Pick<Storage, 'getItem'>): StoredPushSubscription | null {
  try {
    const raw = storage.getItem(PUSH_SUBSCRIPTION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredPushSubscription>;
    if (!UUID_PATTERN.test(parsed.id ?? '')) return null;
    if (parsed.userId !== null && parsed.userId !== undefined && !UUID_PATTERN.test(parsed.userId)) return null;
    return { id: parsed.id!, userId: parsed.userId ?? null };
  } catch {
    return null;
  }
}

export function writeStoredPushSubscription(
  storage: Pick<Storage, 'setItem'>,
  value: StoredPushSubscription,
): void {
  try {
    storage.setItem(PUSH_SUBSCRIPTION_STORAGE_KEY, JSON.stringify(value));
  } catch {
    // Push remains usable when private storage is unavailable; next visit reconciles it.
  }
}

export function clearStoredPushSubscription(storage: Pick<Storage, 'removeItem'>): void {
  try {
    storage.removeItem(PUSH_SUBSCRIPTION_STORAGE_KEY);
  } catch {
    // Nothing else can safely be done when browser storage is unavailable.
  }
}

export function hasWebPushSupport(): boolean {
  return window.isSecureContext
    && 'serviceWorker' in navigator
    && 'PushManager' in window
    && 'Notification' in window;
}

export function isIosDevice(userAgent: string): boolean {
  return /iPad|iPhone|iPod/.test(userAgent);
}

export function isStandaloneApp(): boolean {
  return window.matchMedia('(display-mode: standalone)').matches
    || ('standalone' in navigator && (navigator as Navigator & { standalone?: boolean }).standalone === true);
}

export function isPushRefreshMessage(value: unknown): value is { type: typeof PUSH_REFRESH_MESSAGE } {
  return typeof value === 'object'
    && value !== null
    && (value as { type?: unknown }).type === PUSH_REFRESH_MESSAGE;
}

export async function readyPushRegistration(): Promise<ServiceWorkerRegistration> {
  await navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' });
  return navigator.serviceWorker.ready;
}
