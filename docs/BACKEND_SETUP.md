# Expenso web backend setup

## Runtime model

The backend is implemented with Node.js route handlers inside the same Next.js deployment as the frontend. All browser product calls are same-origin under `/api/v1`. Supabase supplies Auth, Postgres, row-level security, and Storage; route handlers use the current user's cookie session, not a privileged database key.

## Required environment

Copy `apps/web/.env.example` to `apps/web/.env.local` and set:

| Variable | Visibility | Purpose |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | browser-safe | Exact Supabase project URL. |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | browser-safe | Current publishable key from the Supabase project. |
| `NEXT_PUBLIC_SITE_URL` | browser-safe | Canonical site origin used for OAuth redirects and same-origin checks. |
| `APP_ALLOWED_ORIGINS` | server only | Optional comma-separated preview origins. |
| `RATE_LIMIT_SALT` | server only | Random 32+ character salt for irreversible auth-throttle fingerprints. |
| `RATE_LIMIT_SECRET` | server only | Random 32+ character secret matching the Supabase Vault entry below. |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | browser-safe | Public VAPID key passed to `PushManager.subscribe`. |
| `SUPABASE_URL` | server only | Supabase project URL used by the delivery worker. |
| `SUPABASE_SERVICE_ROLE_KEY` | server only | Supabase service-role key used only by internal delivery routes. |
| `VAPID_PUBLIC_KEY` | server only | Public half of the delivery worker VAPID identity. |
| `VAPID_PRIVATE_KEY` | server only | Private VAPID signing key. |
| `VAPID_SUBJECT` | server only | `mailto:` operations contact or owned HTTPS URL. |
| `CRON_SECRET` | server only | 32+ character bearer secret automatically sent by Vercel Cron. |
| `DATABASE_WEBHOOK_SECRET` | server only | 32+ character bearer secret for prompt database-webhook delivery. |

Never put a Supabase secret/service-role key in a `NEXT_PUBLIC_` variable or commit any populated environment file.

## Database

Migrations remain in `supabase/migrations` and are forward-only. Apply them to the supplied project in timestamp order with an authorized Supabase CLI/dashboard session. The current web foundation migration is `20260814010000_web_backend_foundation.sql`.

The existing schema keeps RLS enabled on every exposed product table. Web handlers use the authenticated cookie-backed client so those policies remain the final authorization boundary. Avatar and group-image bytes upload directly to Storage using signed upload tickets; completion routes verify ownership, path, size, MIME type, and object existence before attaching a public URL.

Web-specific migrations are ordered as follows:

1. `20260814010000_web_backend_foundation.sql`
2. `20260814020000_personal_finance_api.sql`
3. `20260814024541_personal_idempotency_hardening.sql`
4. `20260814030000_groups_members_api.sql`
5. `20260814040000_shared_expenses_api.sql`
6. `20260814050000_settlements_web_api.sql`
7. `20260814051000_notifications_web_push.sql`

After applying migrations, create the rate-limiter authorization secret once through an authorized SQL session. Use the exact same random value as `RATE_LIMIT_SECRET`:

```sql
select vault.create_secret(
  'replace-with-a-random-secret-of-at-least-32-characters',
  'expenso_auth_rate_limit_secret'
);
```

The public RPC remains callable by pre-auth routes, but rejects callers without this server-only secret before any write. Expired keys are removed automatically and a hard 100,000-key ceiling prevents unbounded growth.

Local development falls back to a bounded process-local throttle only when PostgREST reports that `check_auth_rate_limit` is absent. This keeps login usable while initially configuring a project. Production remains fail-closed, so apply the migration and create the matching Vault secret before deployment.

## Authentication flow

1. A page request receives a double-submit CSRF cookie and a per-request CSP nonce from Next.js Proxy.
2. Signup/login/Google-start requests require exact allowed `Origin`, `Sec-Fetch-Site` when present, and the matching `x-csrf-token` header.
3. Supabase SSR stores and refreshes the session in cookies.
4. Protected pages and every protected route verify `getClaims()`; they never trust `getSession()` as identity.
5. OAuth returns only through `/auth/callback`; the final destination must be a local relative path.
6. Authenticated responses are `private, no-store` and vary on `Cookie`.

## Foundation endpoints

| Method | Route | Auth | Purpose |
|---|---|---:|---|
| GET | `/api/healthz` | No | Process liveness without dependency details. |
| GET | `/api/readyz` | No | Supabase Auth readiness. |
| GET | `/api/v1/auth/csrf` | No | Obtain the current CSRF token. |
| POST | `/api/v1/auth/signup` | No | Email/password registration. |
| POST | `/api/v1/auth/login` | No | Email/password session creation. |
| POST | `/api/v1/auth/google` | No | Obtain an allowlisted Google OAuth URL. |
| POST | `/api/v1/auth/logout` | Yes | End the local session. |
| GET | `/auth/callback` | OAuth code | Complete PKCE exchange. |
| GET/PATCH | `/api/v1/me` | Yes | Read/update the session profile. |
| POST | `/api/v1/me/avatar/upload-ticket` | Yes | Create a scoped direct-upload ticket. |
| POST | `/api/v1/me/avatar/complete` | Yes | Verify and attach an uploaded avatar. |
| GET | `/api/v1/dashboard?month=YYYY-MM` | Yes | Monthly home, debt, pending, unread, and recent aggregation. |
| GET/POST | `/api/v1/expenses` | Yes | Page or create personal transactions. |
| GET | `/api/v1/expenses/analytics` | Yes | Monthly, lifetime, and category analytics. |
| GET/PATCH/DELETE | `/api/v1/expenses/{expenseId}` | Yes | Read or mutate one owned manual transaction. |
| GET/POST | `/api/v1/groups` | Yes | Page memberships or create group+admin atomically. |
| GET/PATCH/DELETE | `/api/v1/groups/{groupId}` | Yes | Member detail or admin settings/safe deletion. |
| GET/POST | `/api/v1/groups/{groupId}/members` | Yes | Narrow member list or exact-email admin add. |
| DELETE | `/api/v1/groups/{groupId}/members/{userId}` | Yes | Debt-checked admin removal. |
| POST | `/api/v1/groups/{groupId}/image/upload-ticket` | Yes | Admin-scoped image upload ticket. |
| POST | `/api/v1/groups/{groupId}/image/complete` | Yes | Verify and attach group image. |
| GET/POST | `/api/v1/groups/{groupId}/expenses` | Yes | Page or atomically create an equal/exact/percentage shared expense. |
| GET/DELETE | `/api/v1/groups/{groupId}/expenses/{expenseId}` | Yes | Read detail or safely reverse an unsettled payer/admin expense. |
| GET | `/api/v1/groups/{groupId}/balances` | Yes | Current caller-relative pairwise balances and authorized UPI destination. |
| GET/POST | `/api/v1/groups/{groupId}/settlements` | Yes | Page involved history or create an idempotent pending claim. |
| GET | `/api/v1/groups/{groupId}/settlements/{settlementId}` | Yes | Read one involved settlement. |
| POST | `/api/v1/groups/{groupId}/settlements/{settlementId}/confirm` | Receiver | Confirm after a fresh balance snapshot check. |
| POST | `/api/v1/groups/{groupId}/settlements/{settlementId}/reject` | Receiver | Reject without changing balances. |
| GET | `/api/v1/notifications` | Yes | Page the persistent owned inbox. |
| POST | `/api/v1/notifications/{notificationId}/read` | Yes | Idempotently mark one owned notification read. |
| POST | `/api/v1/notifications/read-all` | Yes | Mark every owned notification read. |
| GET | `/api/v1/push-subscriptions/vapid-public-key` | Yes | Return the browser-safe public VAPID key. |
| POST | `/api/v1/push-subscriptions` | Yes | Register or rotate the current browser subscription. |
| DELETE | `/api/v1/push-subscriptions/{subscriptionId}` | Yes | Disable one owned browser subscription. |
| GET | `/api/internal/notifications/drain` | Cron bearer | Lease and deliver a bounded retry batch. |
| POST | `/api/internal/notifications/deliver` | Webhook bearer | Trigger prompt authoritative queue delivery. |

Every JSON response uses the request-ID-bearing envelope defined in the master blueprint. English messages are for people; clients branch only on stable error codes.

Signup, login, and Google-start routes use a durable Supabase-backed rate limiter keyed by an HMAC of the normalized identity and platform-provided client address. Raw email/IP values are not stored. Provider 429 and 5xx failures remain distinct stable API errors and expose `Retry-After` when the application limiter knows it.

Personal transaction creation requires a 16–128 character `Idempotency-Key` header. The database computes the canonical request digest, serializes matching keys, stores the original response privately for 24 hours, replays identical requests, and rejects changed payloads. Create/update/delete and profile aggregate recalculation commit atomically. Group-linked ledger rows remain readable but cannot be edited or deleted through personal routes.

Group listing/detail and member-directory functions derive membership from the verified session. The member directory exposes no UPI value or profile financial aggregates. Only admins can edit group identity, add/remove members, or upload images. Member removal rejects unresolved balances, pending settlements, and sole-admin loss; group deletion preserves all financial history.

Shared-expense split math is server-authoritative and exact to paise. Equal-split remainders use deterministic UUID order; exact splits must sum to the total; percentage splits must total exactly 100.0000. Expense creation/deletion, personal ledger mirrors, balances, idempotency records, and inbox events commit in one transaction.

Settlement creation never confirms payment. It creates a pending claim only after the user explicitly submits “Yes, I paid.” The receiver alone can confirm or reject. Confirmation rechecks the exact outstanding-balance snapshot, allocates oldest eligible splits first, and updates settlement/audit/notification state atomically. Confirmed/rejected states are terminal; repeated actions return the existing state.

## Web Push delivery

The persistent notification row is canonical and commits independently of push availability. Browser subscriptions are protected behind session-derived RPCs; endpoint/key material is never returned. Direct RPC registration enforces supported provider hosts, a maximum of ten active subscriptions per user, key bounds, expiry, and safe endpoint transfer. Legacy mobile FCM tables remain unchanged.

Successful member, shared-expense, and settlement mutations schedule a post-response Node.js delivery attempt. The secured webhook route provides another prompt trigger. `apps/web/vercel.json` configures a daily recovery drain; Vercel Cron sends `Authorization: Bearer ${CRON_SECRET}`. Delivery uses database leases, recipient/owner rechecks, parallel bounded batches, 10-second network timeouts, jittered retries, and terminal handling for HTTP 404/410. Push payloads contain only minimal notification text and validated relative paths.

Configure a Supabase Database Webhook for `INSERT` events on `public.notifications`. Point it to `/api/internal/notifications/deliver` with `Authorization: Bearer ${DATABASE_WEBHOOK_SECRET}`. Supabase sends its standard `{ type, table, schema, record, old_record }` envelope; the route accepts only the expected table/event, derives `record.id`, and reloads authoritative queue state. A compact `{ "notificationId": "<record-id>" }` body remains supported for trusted custom triggers.

## Checks

From `apps/web`:

```bash
npm ci
npm run lint
npm run typecheck
npm test
npm run build
npm audit --audit-level=high
```

CI runs this sequence plus an isolated Supabase migration and pgTAP suite for every branch and pull request.
