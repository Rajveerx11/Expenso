import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { validate } from '@readme/openapi-parser';

const specPath = resolve(process.cwd(), '../../docs/openapi.yaml');
const spec = readFileSync(specPath, 'utf8');

describe('foundation OpenAPI contract', () => {
  it('is valid OpenAPI 3.1 with resolvable references', async () => {
    const result = await validate(specPath);
    expect(result.valid, result.valid ? undefined : JSON.stringify(result.errors)).toBe(true);
  });

  it('documents health, readiness, opaque session cookies, and CSRF', () => {
    expect(spec).toContain('/healthz:');
    expect(spec).toContain('/readyz:');
    expect(spec).toContain('name: Cookie');
    expect(spec).toContain('name: x-csrf-token');
    expect(spec).not.toContain('sb-access-token');
  });

  it('documents exact avatar request bodies', () => {
    expect(spec).toContain('AvatarTicketRequest');
    expect(spec).toContain('AvatarCompleteRequest');
    expect(spec).toContain('maximum: 5242880');
  });

  it('types every auth success envelope and every stable error code', () => {
    for (const schema of ['SignUpResponse', 'LoginResponse', 'GoogleOAuthResponse', 'LogoutResponse']) {
      expect(spec).toContain(`schema: {$ref: '#/components/schemas/${schema}'}`);
    }
    expect(spec).toContain("code: {$ref: '#/components/schemas/ApiErrorCode'}");
    expect(spec).toContain('- IDEMPOTENCY_KEY_REUSED');
    expect(spec).toContain('- INTERNAL_ERROR');
  });

  it('documents personal CRUD, dashboard, paging, and idempotency', () => {
    expect(spec).toContain('/v1/dashboard:');
    expect(spec).toContain('/v1/expenses/{expenseId}:');
    expect(spec).toContain('name: Idempotency-Key');
    expect(spec).toContain('PersonalAnalyticsResponse');
    expect(spec).toContain('PersonalTransactionCreateResponse');
    expect(spec).toContain("nextCursor: {type: [string, 'null']}");
  });
});
