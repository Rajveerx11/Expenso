import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { AppError } from './errors';
import { ok, parseJson, requestIdFor } from './response';

describe('API responses', () => {
  it('uses a supplied safe request ID and rejects unsafe values', () => {
    expect(requestIdFor(new Request('https://example.com', { headers: { 'x-request-id': 'request_1234' } }))).toBe('request_1234');
    expect(requestIdFor(new Request('https://example.com', { headers: { 'x-request-id': '<script>' } }))).not.toBe('<script>');
  });

  it('makes authenticated responses private and no-store', async () => {
    const response = ok({ value: 1 }, 'request_1234');
    expect(response.headers.get('cache-control')).toContain('private');
    expect(response.headers.get('cache-control')).toContain('no-store');
    expect(await response.json()).toEqual({ data: { value: 1 }, meta: { requestId: 'request_1234' } });
  });
});

describe('JSON parsing', () => {
  const schema = z.object({ name: z.string().min(1) }).strict();

  it('parses a valid JSON object', async () => {
    const request = new Request('https://example.com', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Demo' }),
    });
    await expect(parseJson(request, schema)).resolves.toEqual({ name: 'Demo' });
  });

  it('rejects wrong content type, invalid JSON, and oversized declared bodies', async () => {
    await expect(parseJson(new Request('https://example.com', { method: 'POST', body: '{}' }), schema)).rejects.toBeInstanceOf(AppError);
    await expect(parseJson(new Request('https://example.com', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: '{',
    }), schema)).rejects.toBeInstanceOf(AppError);
    await expect(parseJson(new Request('https://example.com', {
      method: 'POST', headers: { 'content-type': 'application/json', 'content-length': '70000' }, body: '{}',
    }), schema)).rejects.toBeInstanceOf(AppError);
  });
});
