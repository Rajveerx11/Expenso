import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiClientError, api, clearApiSessionState, clearPrivateClientState, createIdempotencyKey, fieldErrorFor, fieldErrorsFor, registerPrivateCacheClearer, safeRelativePath } from './client';

const response = (status: number, body: unknown) => new Response(JSON.stringify(body), {
  status,
  headers: { 'content-type': 'application/json' },
});

describe('browser API client', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    clearApiSessionState();
  });

  it('uses same-origin cookies and double-submit CSRF for mutations', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(response(200, { data: { csrfToken: 'csrf-token-a' }, meta: { requestId: 'request-1' } }))
      .mockResolvedValueOnce(response(200, { data: { userId: '00000000-0000-4000-8000-000000000001' }, meta: { requestId: 'request-2' } }));

    await api.auth.login({ email: 'person@example.com', password: 'password123' });

    expect(fetchMock).toHaveBeenNthCalledWith(1, '/api/v1/auth/csrf', expect.objectContaining({ credentials: 'same-origin' }));
    const mutation = fetchMock.mock.calls[1];
    expect(mutation[0]).toBe('/api/v1/auth/login');
    const options = mutation[1] as RequestInit;
    expect(new Headers(options.headers).get('x-csrf-token')).toBe('csrf-token-a');
    expect(options.credentials).toBe('same-origin');
  });

  it('preserves stable backend error details', async () => {
    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(response(409, {
      error: {
        code: 'SETTLEMENT_CHANGED', message: 'Balance changed.', requestId: 'request-3',
        retryable: false, fieldErrors: { amount: ['Too high.'] },
      },
    }));

    await expect(api.groups.settlement(
      '00000000-0000-4000-8000-000000000001',
      '00000000-0000-4000-8000-000000000002',
    )).rejects.toMatchObject({
      code: 'SETTLEMENT_CHANGED', status: 409, requestId: 'request-3', fieldErrors: { amount: ['Too high.'] },
    });
    expect(consoleWarn).toHaveBeenCalledWith('[Expenso API request failed]', {
      method: 'GET',
      path: '/api/v1/groups/:id/settlements/:id',
      status: 409,
      code: 'SETTLEMENT_CHANGED',
      requestId: 'request-3',
      retryable: false,
    });
  });

  it('converts network failures into visible, retryable diagnostics', async () => {
    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new TypeError('offline'));

    await expect(api.groups.get('00000000-0000-4000-8000-000000000001')).rejects.toMatchObject({
      code: 'DEPENDENCY_UNAVAILABLE', status: 0, retryable: true,
    });
    expect(consoleWarn).toHaveBeenCalledWith('[Expenso API request failed]', expect.objectContaining({
      method: 'GET', path: '/api/v1/groups/:id', status: 0, code: 'DEPENDENCY_UNAVAILABLE',
    }));
  });

  it('maps every server validation field without flattening the response', () => {
    const error = new ApiClientError(422, {
      code: 'VALIDATION_ERROR', message: 'Invalid fields.', requestId: 'request-fields', retryable: false,
      fieldErrors: { amount: ['Amount is invalid.'], expenseDate: ['Date is invalid.'] },
    });
    const fields = fieldErrorsFor(error);

    expect(fieldErrorFor(fields, 'amount')).toBe('Amount is invalid.');
    expect(fieldErrorFor(fields, 'date', 'expenseDate')).toBe('Date is invalid.');
    expect(fields).toEqual({ amount: ['Amount is invalid.'], expenseDate: ['Date is invalid.'] });
  });

  it('sends caller-owned idempotency keys without request hashes', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(response(200, { data: { csrfToken: 'csrf-token-b' }, meta: { requestId: 'request-4' } }))
      .mockResolvedValueOnce(response(201, {
        data: { transaction: { id: '00000000-0000-4000-8000-000000000001' }, replayed: false },
        meta: { requestId: 'request-5' },
      }));
    const key = createIdempotencyKey('personal');

    await api.personal.create({
      title: 'Lunch', amount: '10.00', category: 'Food', type: 'expense', expenseDate: '2026-08-14',
    }, key);

    const options = fetchMock.mock.calls[1][1] as RequestInit;
    expect(new Headers(options.headers).get('idempotency-key')).toBe(key);
    expect(String(options.body)).not.toContain('requestHash');
  });

  it('allows only local redirect paths', () => {
    expect(safeRelativePath('/groups/123?tab=balances')).toBe('/groups/123?tab=balances');
    expect(safeRelativePath('//evil.example')).toBe('/dashboard');
    expect(safeRelativePath('/\\evil.example')).toBe('/dashboard');
    expect(safeRelativePath('/\n/evil.example')).toBe('/dashboard');
    expect(safeRelativePath('/\t/evil.example')).toBe('/dashboard');
    expect(safeRelativePath('/%0D/evil.example')).toBe('/dashboard');
    expect(safeRelativePath('https://evil.example')).toBe('/dashboard');
  });

  it('preserves Retry-After for rate-limit UX', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(JSON.stringify({
      error: { code: 'RATE_LIMITED', message: 'Slow down.', requestId: 'request-6', retryable: true },
    }), { status: 429, headers: { 'content-type': 'application/json', 'retry-after': '42' } }));

    await expect(api.personal.get('00000000-0000-4000-8000-000000000001')).rejects.toMatchObject({
      code: 'RATE_LIMITED', retryAfterSeconds: 42, retryable: true,
    });
  });

  it('clears user-scoped cache state during account transitions', () => {
    const clear = vi.fn();
    const unregister = registerPrivateCacheClearer(clear);

    clearPrivateClientState();
    expect(clear).toHaveBeenCalledOnce();
    unregister();
  });

  it('does not navigate away from signup when stale push cleanup receives 401', async () => {
    const replace = vi.fn();
    vi.stubGlobal('window', { location: { pathname: '/signup', search: '', replace } });
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(response(200, { data: { csrfToken: 'csrf-token-c' }, meta: { requestId: 'request-7' } }))
      .mockResolvedValueOnce(response(401, {
        error: { code: 'AUTH_REQUIRED', message: 'Sign in.', requestId: 'request-8', retryable: false },
      }));

    await expect(api.notifications.unsubscribe('00000000-0000-4000-8000-000000000001')).rejects.toMatchObject({
      code: 'AUTH_REQUIRED', status: 401,
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(replace).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});
