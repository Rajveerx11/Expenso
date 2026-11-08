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

  it('documents group lifecycle, members, and direct image upload', () => {
    expect(spec).toContain('/v1/groups/{groupId}/members/{userId}:');
    expect(spec).toContain('/v1/groups/{groupId}/image/upload-ticket:');
    expect(spec).toContain('GroupMemberListResponse');
    expect(spec).toContain('GroupImageTicketResponse');
    expect(spec).toContain('bucket: {type: string, const: group-images}');
    expect(spec.match(/'429': \{\$ref: '#\/components\/responses\/RateLimited'\}/g)?.length ?? 0).toBeGreaterThanOrEqual(4);
    expect(spec.match(/'503': \{\$ref: '#\/components\/responses\/DependencyUnavailable'\}/g)?.length ?? 0).toBeGreaterThanOrEqual(8);
  });

  it('documents three server-authoritative shared-expense modes and balances', () => {
    expect(spec).toContain('/v1/groups/{groupId}/expenses/{expenseId}:');
    expect(spec).toContain('/v1/groups/{groupId}/balances:');
    expect(spec).toContain("const: percentage");
    expect(spec).toContain('Optional browser preview ignored by server allocation.');
    expect(spec).toContain('GroupExpenseCreateResponse');
    expect(spec).toContain('GroupBalanceListResponse');
    expect(spec.match(/NonnegativeMoneyInput/g)?.length ?? 0).toBeGreaterThanOrEqual(3);
    expect(spec).toContain('- SETTLED_EXPENSE_IMMUTABLE');
    expect(spec).toContain("pattern: '^(?=.*[1-9])\\d{1,10}(?:\\.\\d{1,2})?$'");
    expect(spec).toContain("pattern: '^(?=.*[1-9])(?:100(?:\\.0{1,4})?|\\d{1,2}(?:\\.\\d{1,4})?)$'");
  });

  it('documents receiver-confirmed settlements and their stable conflicts', () => {
    expect(spec).toContain('/v1/groups/{groupId}/settlements/{settlementId}/confirm:');
    expect(spec).toContain('/v1/groups/{groupId}/settlements/{settlementId}/reject:');
    expect(spec).toContain('payment remains unconfirmed until receiver action');
    expect(spec).toContain('SettlementCreateResponse');
    expect(spec).toContain('SettlementListResponse');
    expect(spec).toContain('- SETTLEMENT_CHANGED');
    expect(spec).toContain("'428': {$ref: '#/components/responses/PreconditionRequired'}");
  });

  it('documents persistent notifications and secret-free browser push summaries', () => {
    expect(spec).toContain('/v1/notifications/{notificationId}/read:');
    expect(spec).toContain('/v1/notifications/read-all:');
    expect(spec).toContain('/v1/push-subscriptions/vapid-public-key:');
    expect(spec).toContain('/v1/push-subscriptions/{subscriptionId}:');
    expect(spec).toContain('/internal/notifications/drain:');
    expect(spec).toContain('/internal/notifications/deliver:');
    expect(spec).toContain('Safe summary. Push endpoint and encryption keys are never returned.');
    expect(spec).toContain('VapidPublicKeyResponse:');
    expect(spec).toContain("pattern: '^[A-Za-z0-9_-]{87}$'");
    expect(spec).toContain('cronBearer:');
    expect(spec).toContain('webhookBearer:');
    expect(spec).toContain('SupabaseNotificationInsertWebhook:');
    expect(spec).toContain("type: {type: string, const: INSERT}");
    expect(spec).toContain("table: {type: string, const: notifications}");
    expect(spec).toMatch(/\/v1\/notifications:[\s\S]*?default: 50/);
    expect(spec).toMatch(/\/v1\/push-subscriptions:[\s\S]*?'429': \{\$ref: '#\/components\/responses\/RateLimited'\}/);
  });
});
