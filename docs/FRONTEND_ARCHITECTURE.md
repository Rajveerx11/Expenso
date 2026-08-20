# Expenso frontend architecture

## Status and purpose

This document describes the integrated Issue 7 web application, not the earlier fixture-only frontend. It is the shared implementation contract for frontend and backend contributors.

The application is a responsive website delivered by one Next.js deployment. React pages, Node.js route handlers, authentication orchestration, and internal notification endpoints live in `apps/web`. Supabase provides Auth, Postgres, row-level security (RLS), database functions, and Storage. Product data is live; `mockData.ts` and the browser Supabase client were removed.

## Runtime topology

```text
Browser
  | same-origin HTTPS, HttpOnly session cookies, CSRF header on mutations
  v
Next.js 16 application
  |- React 19 App Router pages and layouts
  |- typed /api/v1 route handlers on Node.js
  |- server-only domain services and Supabase SSR client
  `- secured internal notification delivery routes
       |
       v
Supabase
  |- Auth
  |- Postgres + RLS + transactional RPCs
  |- Storage signed uploads
  `- notification queue/webhook source

Push provider <-- server-side Web Push delivery
Service worker <-- minimal browser push payload + same-origin navigation
```

Normal browser product and authentication requests use relative `/api/...` paths. The frontend does not query Supabase tables or Auth directly. The only deliberate browser-to-Supabase request is a short-lived, signed `PUT` for avatar or group-image bytes; a same-origin route issues the ticket and another same-origin route verifies and attaches the uploaded object.

## Stack

- Node.js 22 or later.
- Next.js 16 App Router and React 19.
- Strict TypeScript.
- TanStack Query 5 for remote server state.
- Zod contracts shared by route handlers and contract tests.
- Supabase SSR and Supabase JavaScript libraries on the server boundary.
- CSS design tokens and Tailwind CSS 4 tooling.
- `next/font` for build-time bundled Inter assets; no runtime font CDN dependency.
- `react-hook-form`, `decimal.js`, `date-fns`, Lucide, and Framer Motion where appropriate.
- Vitest for unit and contract tests; Playwright plus Axe for browser, responsive, and accessibility tests.

## Source map

```text
apps/web/
|- e2e/                              Browser journeys, smoke, responsive, Axe
|- public/
|  |- icons/                         PWA and notification icons
|  |- manifest.webmanifest           Install metadata
|  `- sw.js                          Push/service-worker behavior
|- scripts/
|  `- verify-client-secret-boundary.mjs
|- src/app/
|  |- (auth)/                        Login and signup pages
|  |- (dashboard)/                   Authenticated application routes
|  |- api/v1/                        Public same-origin JSON API
|  |- api/internal/                  Cron/webhook notification delivery
|  |- auth/callback/                 Supabase PKCE completion
|  |- onboarding/                    First-run profile completion
|  `- layout.tsx                     Metadata, viewport, global providers
|- src/components/
|  |- layout/                        App frame, sidebar, header, mobile nav
|  `- ui/                            Shared forms, buttons, async states, cards
|- src/features/
|  |- notifications/                 Inbox UI and cache updates
|  |- profile/                       Profile cache helpers
|  |- push/                          Browser subscription and cache refresh
|  |- settlements/                   Settlement hooks and payment-confirmation helpers
|  |- shared-expenses/               Split input/domain helpers
|  `- uploads/                       Browser image normalization/compression
|- src/lib/
|  |- api/client.ts                  Typed same-origin API client
|  |- api/queries.ts                 Canonical TanStack Query keys
|  |- types.ts                       Browser DTOs
|  `- utils.ts                       Money, dates, class, and UPI utilities
|- src/server/
|  |- auth/                          Verified claims and durable rate limiting
|  |- config/                        Validated runtime environment
|  |- http/                          Envelopes, errors, CSRF, CSP, headers
|  |- notifications/                 Queueing and Web Push delivery
|  |- profile/, groups/, ...         Server-only domain services
|  `- supabase/                      Cookie SSR and service-role clients
|- src/shared/api/contracts.ts       Stable errors and Zod request contracts
|- src/proxy.ts                      Session refresh, route guards, CSRF, CSP
|- next.config.ts                    Security headers and image policy
|- playwright.config.ts              Four browser projects and evidence output
`- vercel.json                       Recovery notification drain schedule

supabase/
|- migrations/                       Forward-only schema/RLS/RPC source of truth
`- tests/                            pgTAP, Python contract, concurrency harnesses

docs/
|- BACKEND_SETUP.md                  Environment, migrations, endpoints, delivery
`- openapi.yaml                      Versioned HTTP contract
```

## Route and feature inventory

| Area | Routes | Integrated behavior |
|---|---|---|
| Entry/auth | `/`, `/login`, `/signup`, `/auth/callback` | Email/password signup and login, email-confirmation callback, safe `next` return path, authenticated redirect, logout. |
| Onboarding | `/onboarding` | Completes display name and optional UPI ID against the live profile API. |
| Dashboard | `/dashboard` | Live month totals, net, group debts, unread count, and recent activity. |
| Personal finance | `/expenses`, `/expenses/new`, `/expenses/[expenseId]` | Cursor pagination, filters, analytics, create, detail, update, delete, and linked-transaction protections. |
| Groups | `/groups`, `/groups/new`, `/groups/[groupId]`, `/groups/[groupId]/settings` | Cursor pagination, creation, image upload, admin settings, member add/remove, safe deletion, and authorization states. |
| Shared expenses | `/groups/[groupId]/expenses/new`, `/groups/[groupId]/expenses/[expenseId]` | Equal, exact, and percentage splits; server-authoritative rounding; detail; protected reversal/deletion. |
| Settlements | `/groups/[groupId]/settle/[receiverId]`, `/groups/[groupId]/settlements/[settlementId]` | Current balance, copy/manual UPI details, explicit payment acknowledgement, idempotent claim, receiver confirm/reject, terminal status and conflict handling. |
| Notifications | `/notifications` | Persistent cursor-paged inbox, unread count, mark-one/read-all, linked navigation, Web Push controls. |
| Profile | `/profile`, `/profile/edit` | Live financial summary, name/UPI update, normalized avatar upload, sidebar synchronization, logout. |

Authenticated layouts load the verified user and initial profile on the server. `DashboardFrame` then supplies the responsive shell, a single focusable `main` landmark, skip link, live profile/sidebar data, unread count, and cache-invalidation bridge. Foreground Web Push messages invalidate immediately. A visibility-aware, same-origin 15-second polling fallback invalidates active private queries for users who decline or cannot use Web Push; focus, visibility return, and reconnect also refresh immediately. This avoids exposing HttpOnly sessions to a browser Supabase client while keeping inbox, balances, settlements, and active pages current.

## Client API boundary

`src/lib/api/client.ts` is the browser's only product API gateway.

### Transport rules

- Requests must use same-origin `/api/...` paths.
- Cookies use `credentials: 'same-origin'`; responses are requested with `cache: 'no-store'`.
- JSON success responses use `{ data, meta: { requestId, nextCursor? } }`.
- JSON errors use `{ error: { code, message, requestId, fieldErrors?, retryable } }`.
- UI logic branches on stable error codes and status, not English text.
- Dynamic path identifiers are encoded before use.
- A 401 clears private client state and returns to `/login?next=...` through a validated relative path.

### Mutation rules

- The client lazily obtains a double-submit CSRF token from `/api/v1/auth/csrf`.
- Every non-GET/HEAD/OPTIONS request sends `x-csrf-token`.
- One rejected CSRF request refreshes the token and retries once.
- Mutations are not automatically retried by TanStack Query.
- Personal transaction creation, shared-expense creation, and settlement creation send a unique `Idempotency-Key`.
- Idempotency keys are stable for one user submit attempt; the server/database decides whether a request is a replay or invalid key reuse.
- Validation responses can provide `fieldErrors`; forms map these to controls, set `aria-invalid`/descriptions, and focus the first invalid field.

### DTO rules

`src/lib/types.ts` contains browser-facing camelCase DTOs. Database rows remain private and snake_case.

- Money crosses the boundary as a canonical decimal string such as `"125.50"`; it is not persisted or allocated with JavaScript floating-point arithmetic.
- IDs and timestamps are strings.
- Cursor pagination is represented as `{ items, nextCursor }` in the client.
- Shared request schemas live in `src/shared/api/contracts.ts`; `docs/openapi.yaml` is the external HTTP reference.
- Route handlers validate input, derive identity from verified session claims, call RLS-protected queries/RPCs, and map only allowed fields.

## Server state and cache model

TanStack Query owns remote data. Local component state is limited to forms, selected tabs, dialog state, and short-lived presentation state.

Canonical query families include:

- `profile`
- `dashboard/{month}`
- personal list/detail/analytics
- group list/detail/members/expenses/expense detail/balances
- settlement list/detail
- notifications

Default query behavior:

- 60-second stale time.
- Retry only retryable `ApiClientError` failures, with fewer than two failed retry attempts.
- No mutation retry.
- Cursor lists use `useInfiniteQuery`; UI appends pages without replacing prior items.

Mutation success handlers either write authoritative returned DTOs into the exact cache or invalidate every affected aggregate. For example, a shared-expense change refreshes group expenses, group summary, balances, group list, dashboard, personal ledger/analytics, and profile aggregates.

If a background refetch fails after usable data loaded, the page keeps the last safe data visible and shows an accessible, non-destructive “Showing saved data” warning with retry. A full-page error is reserved for requests with no usable data. Empty collections are valid loaded data, not failures.

Private caches and CSRF memory are cleared on logout, expired session, and account transition. This prevents one user's cached profile, group, or finance data appearing after another user signs in within the same tab.

## Feature details

### Authentication and profile

Next.js Proxy refreshes Supabase SSR cookies, protects dashboard prefixes, redirects authenticated users away from login/signup, issues CSRF state, and attaches a per-request CSP nonce. Server code uses `auth.getClaims()` as identity; it does not trust `getSession()`.

Session cookies are forced `HttpOnly`, `SameSite=Lax`, scoped to `/`, and `Secure` in production. No browser Supabase client exists. Login, signup, email confirmation, onboarding, logout, deep-link return, and protected-route redirect are connected.

Avatar and group-image uploads are re-encoded and resized in the browser before upload, which also removes original file metadata. The backend controls MIME/size/path, issues a scoped signed ticket, and verifies the object during completion.

### Personal finance

The personal ledger combines a cursor-paged transaction query with month analytics. Month and type filters are part of query keys. Detail pages support update/delete only when the backend marks a manual transaction editable. Group-linked ledger mirrors remain readable but must be changed through their source group expense.

Dashboard and profile totals come from backend aggregates. Create/update/delete responses trigger all dependent cache refreshes.

### Groups and shared expenses

Group overview composes profile, group, members, paged expenses, balances, and paged settlement history. Admin controls are shown from the server-returned role, while backend authorization and RLS remain authoritative.

Split UI supports:

- equal split selection and preview;
- exact per-member amounts;
- percentage shares with four decimal places.

Browser calculations are previews only. The backend/database validates membership, total equality, exact paise allocation, deterministic remainder handling, idempotency, personal mirrors, balances, audit state, and notification creation in one transaction.

### Settlements

The settle route loads the payer-relative outstanding balance and receiver payment destination. Because UPI apps can reject or misclassify raw browser-launched personal-payment intents, Expenso shows copyable UPI ID, amount, and note details for payment inside a user-opened UPI app. The payer must explicitly confirm completion, which submits an idempotent pending claim for receiver confirmation.

The receiver alone sees confirm/reject actions. Confirmation rechecks the balance snapshot; stale or excessive claims return stable conflict codes. UI handles pending, confirmed, rejected, partial-balance, waiting, terminal, and retry/error states. Confirm/reject refreshes balances, settlements, group, dashboard, profile, personal ledger, and notifications.

### Notifications and Web Push

The persistent inbox is canonical. It supports paging, optimistic read/read-all cache updates, unread dashboard/sidebar count, and safe same-origin links.

Browser push flow:

1. Register `/sw.js` and wait for the active service worker.
2. Obtain the authenticated browser-safe VAPID public key.
3. Request notification permission only from the explicit “Turn on” action.
4. Reconcile any existing browser subscription with the current VAPID key.
5. Register the serialized subscription through `/api/v1/push-subscriptions` and store only its server ID/user ID summary locally.
6. On disable/account transition, remove browser and server state best-effort. A server cleanup failure leaves local state Off and exposes a cleanup-only retry; it never silently re-enables push.

Existing same-key browser subscriptions survive transient profile/VAPID/upsert failures. Only a subscription created or replaced by the current attempt is rolled back. A stale server ID cannot block VAPID-key recovery.

`sw.js` validates all payload text and navigation targets. It notifies open clients to refresh private query families, suppresses a system notification when the visible inbox already shows the event, focuses/navigates an existing same-origin window on click, and renews changed subscriptions through CSRF-protected same-origin APIs.

The service worker is currently push-focused. It does not provide an offline data cache or offline mutation queue.

## Responsive and accessibility model

- Desktop uses a persistent sidebar; compact viewports use bottom navigation.
- Focused flows such as settlement hide bottom navigation when it would compete with the primary action.
- Content is verified at 360, 768, 1024, and 1440 pixel widths, plus a 720-pixel viewport at 200% zoom.
- The authenticated shell has one `main` landmark and a working keyboard skip link.
- Interactive targets are designed for at least 44 by 44 CSS pixels.
- Forms use real labels, grouped-control names, `aria-describedby`, live status/error regions, and focus restoration.
- Dialogs trap focus, close with Escape, and restore focus to the opener.
- Loading, empty, blocking error, cached-data warning, success, disabled, and reduced-motion states are explicit.
- Color-token contrast has automated checks; Playwright runs WCAG A/AA Axe checks for serious and critical violations.

## Security boundaries

Frontend code must preserve these constraints:

- Never expose `SUPABASE_SERVICE_ROLE_KEY`, VAPID private key, rate-limit secret, cron secret, or webhook secret to browser code.
- Only variables explicitly documented as browser-safe may use `NEXT_PUBLIC_`.
- Authenticated JSON responses are private/no-store and vary by cookie.
- Mutations require allowed origin/fetch metadata and matching CSRF state.
- Redirects accept only canonical local relative paths; control characters, backslashes, scheme-relative URLs, and foreign origins are rejected.
- CSP is nonce-based and limits network access to the configured site/Supabase origins; framing, MIME sniffing, sensitive permissions, and unsafe referrer behavior are blocked by headers.
- Supabase RLS remains the final data-authorization boundary even when route handlers perform earlier role checks.
- Signed upload completion verifies owner, bucket, path, MIME, size, and object existence.
- Web Push endpoints are restricted to supported HTTPS provider hosts; raw endpoint/key material is not returned by list/read APIs.
- Internal drain/delivery endpoints require dedicated bearer secrets and reload authoritative database state.

CI builds with sentinel server secrets, then scans `.next/static` and `public` to prove those values did not enter browser artifacts.

## Backend contract and contributor ownership

### Frontend ownership

- Pages, layouts, navigation, reusable UI, accessible interaction states.
- `src/lib/api/client.ts` request wrappers and browser DTO consumption.
- Query keys, cache writes/invalidation, pagination, stale-data presentation.
- Form mapping, client previews, upload normalization, and manual UPI presentation.
- Manifest, service-worker browser behavior, push subscription controls.
- Component/unit/browser/accessibility tests.

### Backend ownership

- `/api/v1` and `/api/internal` route handlers.
- Session verification, authorization, CSRF/origin enforcement, rate limits, response headers.
- Server-only services, Supabase clients, signed-ticket issuance/completion, notification delivery.
- Database migrations, RLS, transactional RPCs, authoritative money/split/settlement rules.
- OpenAPI, backend contract tests, pgTAP, concurrency harnesses, deployment secrets.

### Shared seam

Contract changes require coordination. A compatible change updates, as applicable:

1. `docs/openapi.yaml`;
2. `src/shared/api/contracts.ts` request/error schemas;
3. `src/lib/types.ts` response DTOs;
4. `src/lib/api/client.ts` wrapper;
5. route handler/service mapping;
6. unit, route, database, and browser tests.

Frontend code must not bypass a missing endpoint with fixture data or a direct table call. Backend code must not return raw rows, rely on UI authorization, or change stable error codes without updating the shared seam.

## PWA and deployment

`manifest.webmanifest` defines a standalone, portrait-oriented finance app with regular and maskable icons. Metadata exposes the manifest and Apple web-app settings. `/sw.js` is served without caching, with a dedicated CSP and root scope.

The repository is prepared for one Node.js-capable Next.js deployment. `vercel.json` defines the daily recovery drain for Web Push delivery. Another host is acceptable only if it supports the same Node.js route-handler runtime, environment separation, HTTPS, scheduled recovery call, webhook reachability, and single canonical origin.

Required variables are documented in `apps/web/.env.example` and `docs/BACKEND_SETUP.md`. Browser-safe and server-only variables must remain separate. Production also requires:

- all forward-only Supabase migrations applied in timestamp order;
- `expenso_auth_rate_limit_secret` stored in Supabase Vault and matching `RATE_LIMIT_SECRET`;
- Auth redirect URLs and canonical site origin configured;
- avatar/group-image buckets and policies from migrations;
- VAPID keys and subject;
- cron and database-webhook secrets;
- an `INSERT` webhook for `public.notifications` targeting the secured delivery route.

### Hosted-project caveat

Issue 7 was verified end-to-end against an isolated local Supabase stack. The supplied hosted project URL is the intended target, but repository code and local tests do not prove that hosted migrations, Vault values, Auth redirects, Storage policies, webhook, or hosting environment variables have been applied. At the time of this architecture update, hosted Supabase deployment remained a separate owner-authorized step. Do not label the hosted application production-ready until `docs/BACKEND_SETUP.md` has been completed against that project and hosted smoke tests pass.

## Verification and CI

Local frontend checks from `apps/web`:

```bash
npm ci
npm run lint
npm run typecheck
npm test
npm run build
npm run verify:client-secrets
npm audit --audit-level=high
npm run test:e2e
```

GitHub Actions has three jobs:

1. **Database:** starts isolated Supabase, applies migrations, runs pgTAP plus personal-finance, shared-expense, settlement, and Web Push concurrency harnesses.
2. **Quality:** lint, typecheck, Vitest, Python database-contract tests, high-severity dependency audit, production build, and browser-secret scan.
3. **E2E:** starts isolated Supabase and the web app, generates test VAPID keys, then installs and runs Chromium, Firefox, and WebKit projects.

Playwright projects:

- `chromium-full`: complete two-user auth, profile/upload, personal ledger, groups, split rounding, deletion/reversal, authorization, settlement confirmation/rejection, notifications, Web Push, cache isolation, navigation, and responsive journey.
- `firefox-smoke`: critical Firefox route/interaction smoke coverage.
- `chromium-a11y`: responsive, zoom, keyboard, touch-target, reduced-motion, and Axe coverage.
- `webkit-smoke`: Safari/WebKit responsive and accessibility coverage.

Traces and video are recorded; CI uploads browser results, reports, screenshots, and curated verification evidence even when the browser job fails.

Database, route, service, contract, cache, browser-helper, PWA, security-header, cookie, OpenAPI, and client-secret-boundary tests complement the browser suite. Passing UI tests never replace RLS, pgTAP, or concurrency verification.

## Change checklist

Before handing work across the frontend/backend seam:

- Keep money as decimal strings and IDs encoded.
- Use the typed same-origin API client; do not add fixtures or direct browser Supabase data calls.
- Add/update canonical query keys and every dependent invalidation.
- Preserve cached data on background refetch failure; block only without usable data.
- Map stable server field errors to accessible controls.
- Generate/reuse idempotency keys for protected create flows.
- Cover loading, empty, error, stale, success, disabled, mobile, keyboard, and reduced-motion behavior.
- Update OpenAPI/contracts/DTOs together.
- Run focused tests, full typecheck/lint, then proportional route/E2E/database checks.
- Verify server-only values are absent from browser output.
- Treat local success and hosted deployment as separate evidence.
