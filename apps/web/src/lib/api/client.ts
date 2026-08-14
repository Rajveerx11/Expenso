'use client';

import type {
  Analytics,
  AppNotification,
  DashboardData,
  GroupBalance,
  GroupExpense,
  GroupMember,
  GroupSummary,
  PersonalTransaction,
  Profile,
  Settlement,
  WebPushSubscriptionSummary,
} from '@/lib/types';
import { compressImageForUpload } from '@/features/uploads/compress-image';
import type { ApiErrorCode, ErrorResponse, SuccessResponse } from '@/shared/api/contracts';

export class ApiClientError extends Error {
  readonly code: ApiErrorCode;
  readonly status: number;
  readonly retryable: boolean;
  readonly requestId?: string;
  readonly fieldErrors?: Record<string, string[]>;
  readonly retryAfterSeconds?: number;

  constructor(status: number, payload?: ErrorResponse['error'], retryAfterSeconds?: number) {
    super(payload?.message ?? 'Request failed.');
    this.name = 'ApiClientError';
    this.status = status;
    this.code = payload?.code ?? 'INTERNAL_ERROR';
    this.retryable = payload?.retryable ?? status >= 500;
    this.requestId = payload?.requestId;
    this.fieldErrors = payload?.fieldErrors;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export type ApiFieldErrors = Record<string, string[]>;

export function fieldErrorsFor(error: unknown): ApiFieldErrors {
  return error instanceof ApiClientError ? (error.fieldErrors ?? {}) : {};
}

export function fieldErrorFor(errors: ApiFieldErrors, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const message = errors[key]?.[0];
    if (message) return message;
  }
  return undefined;
}

export function focusFirstInvalidField(form: HTMLFormElement | null): void {
  requestAnimationFrame(() => {
    const invalid = form?.querySelector<HTMLElement>('[aria-invalid="true"], [data-invalid="true"]');
    if (!invalid) return;
    if (invalid.matches('input, textarea, select, button, [tabindex]')) invalid.focus();
    else invalid.querySelector<HTMLElement>('input, textarea, select, button, [tabindex]')?.focus();
  });
}

interface ApiOptions extends Omit<RequestInit, 'body'> {
  json?: unknown;
  idempotencyKey?: string;
}

let csrfToken: string | null = null;
let csrfRequest: Promise<string> | null = null;
let clearPrivateCache: (() => void) | null = null;

export function clearApiSessionState(): void {
  csrfToken = null;
  csrfRequest = null;
}

export function registerPrivateCacheClearer(clearer: () => void): () => void {
  clearPrivateCache = clearer;
  return () => {
    if (clearPrivateCache === clearer) clearPrivateCache = null;
  };
}

export function clearPrivateClientState(): void {
  clearApiSessionState();
  clearPrivateCache?.();
}

async function getCsrfToken(force = false): Promise<string> {
  if (force) csrfToken = null;
  if (csrfToken) return csrfToken;
  if (!csrfRequest) {
    csrfRequest = fetch('/api/v1/auth/csrf', {
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { Accept: 'application/json' },
    })
      .then(async (response) => {
        const payload = await response.json() as SuccessResponse<{ csrfToken: string }> | ErrorResponse;
        if (!response.ok || !('data' in payload)) {
          throw new ApiClientError(response.status, 'error' in payload ? payload.error : undefined);
        }
        csrfToken = payload.data.csrfToken;
        return csrfToken;
      })
      .finally(() => { csrfRequest = null; });
  }
  return csrfRequest;
}

function isMutation(method: string): boolean {
  return !['GET', 'HEAD', 'OPTIONS'].includes(method);
}

export function safeRelativePath(value: string | null | undefined, fallback = '/dashboard'): string {
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.includes('\\') || /[\u0000-\u001F\u007F]|%(?:0[0-9A-F]|1[0-9A-F]|7F)/i.test(value)) return fallback;
  try {
    const base = 'https://expenso.invalid';
    const parsed = new URL(value, base);
    return parsed.origin === base ? `${parsed.pathname}${parsed.search}${parsed.hash}` : fallback;
  } catch {
    return fallback;
  }
}

function handleExpiredSession(path: string): void {
  if (
    typeof window === 'undefined'
    || path.endsWith('/auth/login')
    || window.location.pathname === '/login'
    || window.location.pathname === '/signup'
  ) return;
  clearPrivateClientState();
  const next = safeRelativePath(`${window.location.pathname}${window.location.search}`);
  window.location.replace(`/login?next=${encodeURIComponent(next)}`);
}

async function apiRequest<T>(path: string, options: ApiOptions = {}, retryCsrf = true): Promise<SuccessResponse<T>> {
  if (!path.startsWith('/api/')) throw new Error('API requests must use same-origin /api paths.');
  const method = (options.method ?? 'GET').toUpperCase();
  const headers = new Headers(options.headers);
  headers.set('Accept', 'application/json');
  if (options.json !== undefined) headers.set('Content-Type', 'application/json');
  if (options.idempotencyKey) headers.set('Idempotency-Key', options.idempotencyKey);
  if (isMutation(method)) headers.set('x-csrf-token', await getCsrfToken());

  const response = await fetch(path, {
    ...options,
    method,
    headers,
    body: options.json === undefined ? undefined : JSON.stringify(options.json),
    credentials: 'same-origin',
    cache: 'no-store',
  });
  const payload = await response.json().catch(() => null) as SuccessResponse<T> | ErrorResponse | null;
  if (!response.ok || !payload || !('data' in payload)) {
    const retryAfter = Number(response.headers.get('retry-after'));
    const error = new ApiClientError(
      response.status,
      payload && 'error' in payload ? payload.error : undefined,
      Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : undefined,
    );
    if (retryCsrf && isMutation(method) && response.status === 403) {
      await getCsrfToken(true);
      return apiRequest<T>(path, options, false);
    }
    if (response.status === 401) handleExpiredSession(path);
    throw error;
  }
  return payload;
}

function query(path: string, values: Record<string, string | number | undefined>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined && value !== '') params.set(key, String(value));
  }
  const encoded = params.toString();
  return encoded ? `${path}?${encoded}` : path;
}

export function createIdempotencyKey(scope: string): string {
  return `${scope}:${crypto.randomUUID()}`;
}

export interface Page<T> { items: T[]; nextCursor: string | null }
export interface UploadTicket {
  bucket: 'avatars' | 'group-images'; path: string; token: string; signedUrl: string; expiresIn: number;
}
export interface GroupExpenseDetail { expense: GroupExpense; splits: Array<{
  id: string; expenseId: string; userId: string; userName: string; owedAmount: string;
  settledAmount: string; isSettled: boolean; settledAt: string | null;
}> }

export type PersonalTransactionInput = Pick<PersonalTransaction, 'title' | 'amount' | 'category' | 'type' | 'expenseDate'> & {
  note?: string | null;
};
export type GroupExpenseInput = {
  paidBy: string; title: string; totalAmount: string; category: string; note?: string | null;
  expenseDate: string;
} & (
  | { splitType: 'equal'; splits: Array<{ userId: string; owedAmount?: string }> }
  | { splitType: 'exact'; splits: Array<{ userId: string; owedAmount: string }> }
  | { splitType: 'percentage'; splits: Array<{ userId: string; percentage: string; owedAmount?: string }> }
);

async function uploadSignedFile(ticket: UploadTicket, file: File): Promise<void> {
  const response = await fetch(ticket.signedUrl, {
    method: 'PUT',
    headers: { 'Content-Type': file.type },
    body: file,
    cache: 'no-store',
  });
  if (!response.ok) throw new ApiClientError(response.status, {
    code: 'DEPENDENCY_UNAVAILABLE',
    message: 'Image upload failed. Try again.',
    requestId: response.headers.get('x-request-id') ?? crypto.randomUUID(),
    retryable: true,
  });
}

export const api = {
  auth: {
    login: (input: { email: string; password: string }) =>
      apiRequest<{ userId: string }>('/api/v1/auth/login', { method: 'POST', json: input }).then((value) => value.data),
    signup: (input: { fullName: string; email: string; password: string }) =>
      apiRequest<{ userId: string; emailConfirmationRequired: boolean }>('/api/v1/auth/signup', { method: 'POST', json: input }).then((value) => value.data),
    google: (next = '/dashboard') =>
      apiRequest<{ url: string }>('/api/v1/auth/google', { method: 'POST', json: { next } }).then((value) => value.data),
    logout: async () => {
      const result = await apiRequest<{ signedOut: true }>('/api/v1/auth/logout', { method: 'POST' });
      clearPrivateClientState();
      return result.data;
    },
  },
  profile: {
    get: () => apiRequest<Profile>('/api/v1/me').then((value) => value.data),
    update: (patch: { fullName?: string; upiId?: string | null }) =>
      apiRequest<Profile>('/api/v1/me', { method: 'PATCH', json: patch }).then((value) => value.data),
    uploadAvatar: async (file: File) => {
      const uploadFile = await compressImageForUpload(file, { maxDimension: 512, quality: 0.82 });
      const ticket = await apiRequest<UploadTicket>('/api/v1/me/avatar/upload-ticket', {
        method: 'POST', json: { contentType: uploadFile.type, sizeBytes: uploadFile.size },
      }).then((value) => value.data);
      await uploadSignedFile(ticket, uploadFile);
      return apiRequest<Profile>('/api/v1/me/avatar/complete', {
        method: 'POST', json: { path: ticket.path },
      }).then((value) => value.data);
    },
  },
  dashboard: (month: string) => apiRequest<DashboardData>(query('/api/v1/dashboard', { month })).then((value) => value.data),
  personal: {
    list: (month: string, type: 'all' | 'income' | 'expense' = 'all', cursor?: string, limit = 100) =>
      apiRequest<PersonalTransaction[]>(query('/api/v1/expenses', { month, type, cursor, limit }))
        .then((value) => ({ items: value.data, nextCursor: value.meta.nextCursor ?? null })),
    analytics: (month: string) => apiRequest<Analytics>(query('/api/v1/expenses/analytics', { month })).then((value) => value.data),
    get: (expenseId: string) => apiRequest<PersonalTransaction>(`/api/v1/expenses/${encodeURIComponent(expenseId)}`)
      .then((value) => value.data),
    create: (input: PersonalTransactionInput, idempotencyKey: string) =>
      apiRequest<{ transaction: PersonalTransaction; replayed: boolean }>('/api/v1/expenses', {
        method: 'POST', json: input, idempotencyKey,
      }).then((value) => value.data),
    update: (expenseId: string, patch: Partial<PersonalTransactionInput>) =>
      apiRequest<PersonalTransaction>(`/api/v1/expenses/${encodeURIComponent(expenseId)}`, { method: 'PATCH', json: patch })
        .then((value) => value.data),
    remove: (expenseId: string) => apiRequest<{ deleted: true; expenseId: string }>(
      `/api/v1/expenses/${encodeURIComponent(expenseId)}`, { method: 'DELETE' },
    ).then((value) => value.data),
  },
  groups: {
    list: (cursor?: string, limit = 100) => apiRequest<GroupSummary[]>(query('/api/v1/groups', { cursor, limit }))
      .then((value) => ({ items: value.data, nextCursor: value.meta.nextCursor ?? null })),
    get: (groupId: string) => apiRequest<GroupSummary>(`/api/v1/groups/${encodeURIComponent(groupId)}`).then((value) => value.data),
    create: (input: { name: string; description?: string | null }) =>
      apiRequest<GroupSummary>('/api/v1/groups', { method: 'POST', json: input }).then((value) => value.data),
    update: (groupId: string, patch: { name?: string; description?: string | null; simplifiedDebts?: boolean }) =>
      apiRequest<GroupSummary>(`/api/v1/groups/${encodeURIComponent(groupId)}`, { method: 'PATCH', json: patch }).then((value) => value.data),
    remove: (groupId: string) => apiRequest<{ deleted: true; groupId: string }>(
      `/api/v1/groups/${encodeURIComponent(groupId)}`, { method: 'DELETE' },
    ).then((value) => value.data),
    members: (groupId: string) => apiRequest<GroupMember[]>(`/api/v1/groups/${encodeURIComponent(groupId)}/members`).then((value) => value.data),
    addMember: (groupId: string, email: string) => apiRequest<GroupMember>(
      `/api/v1/groups/${encodeURIComponent(groupId)}/members`, { method: 'POST', json: { email } },
    ).then((value) => value.data),
    removeMember: (groupId: string, userId: string) => apiRequest<{ removed: true; userId: string }>(
      `/api/v1/groups/${encodeURIComponent(groupId)}/members/${encodeURIComponent(userId)}`, { method: 'DELETE' },
    ).then((value) => value.data),
    uploadImage: async (groupId: string, file: File) => {
      const uploadFile = await compressImageForUpload(file, { maxDimension: 1280, quality: 0.84 });
      const base = `/api/v1/groups/${encodeURIComponent(groupId)}/image`;
      const ticket = await apiRequest<UploadTicket>(`${base}/upload-ticket`, {
        method: 'POST', json: { contentType: uploadFile.type, sizeBytes: uploadFile.size },
      }).then((value) => value.data);
      await uploadSignedFile(ticket, uploadFile);
      return apiRequest<GroupSummary>(`${base}/complete`, {
        method: 'POST', json: { path: ticket.path },
      }).then((value) => value.data);
    },
    expenses: (groupId: string, cursor?: string, limit = 100) => apiRequest<GroupExpense[]>(
      query(`/api/v1/groups/${encodeURIComponent(groupId)}/expenses`, { cursor, limit }),
    ).then((value) => ({ items: value.data, nextCursor: value.meta.nextCursor ?? null })),
    expense: (groupId: string, expenseId: string) => apiRequest<GroupExpenseDetail>(
      `/api/v1/groups/${encodeURIComponent(groupId)}/expenses/${encodeURIComponent(expenseId)}`,
    ).then((value) => value.data),
    createExpense: (groupId: string, input: GroupExpenseInput, idempotencyKey: string) => apiRequest<GroupExpenseDetail & { replayed: boolean }>(
      `/api/v1/groups/${encodeURIComponent(groupId)}/expenses`, { method: 'POST', json: input, idempotencyKey },
    ).then((value) => value.data),
    removeExpense: (groupId: string, expenseId: string) => apiRequest<{ deleted: true; expenseId: string }>(
      `/api/v1/groups/${encodeURIComponent(groupId)}/expenses/${encodeURIComponent(expenseId)}`, { method: 'DELETE' },
    ).then((value) => value.data),
    balances: (groupId: string) => apiRequest<GroupBalance[]>(`/api/v1/groups/${encodeURIComponent(groupId)}/balances`).then((value) => value.data),
    settlements: (groupId: string, cursor?: string, limit = 100) => apiRequest<Settlement[]>(
      query(`/api/v1/groups/${encodeURIComponent(groupId)}/settlements`, { cursor, limit }),
    ).then((value) => ({ items: value.data, nextCursor: value.meta.nextCursor ?? null })),
    settlement: (groupId: string, settlementId: string) => apiRequest<Settlement>(
      `/api/v1/groups/${encodeURIComponent(groupId)}/settlements/${encodeURIComponent(settlementId)}`,
    ).then((value) => value.data),
    createSettlement: (groupId: string, input: { receiverId: string; amount: string; transactionRef?: string | null }, idempotencyKey: string) =>
      apiRequest<{ settlement: Settlement; replayed: boolean }>(`/api/v1/groups/${encodeURIComponent(groupId)}/settlements`, {
        method: 'POST', json: input, idempotencyKey,
      }).then((value) => value.data),
    respondSettlement: (groupId: string, settlementId: string, action: 'confirm' | 'reject') => apiRequest<Settlement>(
      `/api/v1/groups/${encodeURIComponent(groupId)}/settlements/${encodeURIComponent(settlementId)}/${action}`,
      { method: 'POST' },
    ).then((value) => value.data),
  },
  notifications: {
    vapidPublicKey: () => apiRequest<{ publicKey: string }>('/api/v1/push-subscriptions/vapid-public-key')
      .then((value) => value.data.publicKey),
    list: (cursor?: string, limit = 100) => apiRequest<AppNotification[]>(query('/api/v1/notifications', { cursor, limit }))
      .then((value) => ({ items: value.data, nextCursor: value.meta.nextCursor ?? null })),
    read: (notificationId: string) => apiRequest<{ read: true; notificationId: string }>(
      `/api/v1/notifications/${encodeURIComponent(notificationId)}/read`, { method: 'POST' },
    ).then((value) => value.data),
    readAll: () => apiRequest<{ read: true; updatedCount: number }>('/api/v1/notifications/read-all', { method: 'POST' })
      .then((value) => value.data),
    subscribe: (input: PushSubscriptionJSON & { userAgent?: string | null }) => apiRequest<WebPushSubscriptionSummary>(
      '/api/v1/push-subscriptions', { method: 'POST', json: input },
    ).then((value) => value.data),
    unsubscribe: (subscriptionId: string) => apiRequest<{ disabled: true; subscriptionId: string }>(
      `/api/v1/push-subscriptions/${encodeURIComponent(subscriptionId)}`, { method: 'DELETE' },
    ).then((value) => value.data),
  },
};

export function messageForError(error: unknown): string {
  if (!(error instanceof ApiClientError)) return 'Something went wrong. Try again.';
  if (error.code === 'SETTLEMENT_CHANGED') return 'Balance changed. Reject this request and create a new settlement.';
  if (error.code === 'SETTLEMENT_EXCEEDS_BALANCE') return 'Amount exceeds your latest outstanding balance.';
  if (error.code === 'PENDING_SETTLEMENT_EXISTS') return 'A payment claim is already waiting for confirmation.';
  if (error.code === 'LINKED_TRANSACTION_READ_ONLY') return 'Group-linked transactions can only change from their group.';
  if (error.code === 'SETTLED_EXPENSE_IMMUTABLE') return 'This expense has settled shares and cannot be deleted.';
  if (error.code === 'MEMBER_ALREADY_EXISTS') return 'This person is already a group member.';
  if (error.code === 'REGISTERED_USER_NOT_FOUND') return 'No Expenso account was found for that email.';
  if (error.code === 'UNRESOLVED_MEMBER_DEBT') return 'Settle this member’s balance before removing them.';
  if (error.code === 'GROUP_HISTORY_RETAINED') return 'This group has financial history and must be retained.';
  if (error.code === 'RATE_LIMITED') return error.retryAfterSeconds
    ? `Too many requests. Try again in ${error.retryAfterSeconds} seconds.`
    : 'Too many requests. Try again later.';
  if (error.code === 'VALIDATION_ERROR' && error.fieldErrors) {
    return Object.values(error.fieldErrors).flat()[0] ?? error.message;
  }
  return error.message;
}
