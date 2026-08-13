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

Never put a Supabase secret/service-role key in a `NEXT_PUBLIC_` variable or commit any populated environment file.

## Database

Migrations remain in `supabase/migrations` and are forward-only. Apply them to the supplied project in timestamp order with an authorized Supabase CLI/dashboard session. The current web foundation migration is `20260814010000_web_backend_foundation.sql`.

The existing schema keeps RLS enabled on every exposed product table. Web handlers use the authenticated cookie-backed client so those policies remain the final authorization boundary. Avatar bytes upload directly to the `avatars` bucket using a signed upload ticket; the completion route verifies ownership, path, size, MIME type, and object existence before attaching the public URL.

After applying migrations, create the rate-limiter authorization secret once through an authorized SQL session. Use the exact same random value as `RATE_LIMIT_SECRET`:

```sql
select vault.create_secret(
  'replace-with-a-random-secret-of-at-least-32-characters',
  'expenso_auth_rate_limit_secret'
);
```

The public RPC remains callable by pre-auth routes, but rejects callers without this server-only secret before any write. Expired keys are removed automatically and a hard 100,000-key ceiling prevents unbounded growth.

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

Every JSON response uses the request-ID-bearing envelope defined in the master blueprint. English messages are for people; clients branch only on stable error codes.

Signup, login, and Google-start routes use a durable Supabase-backed rate limiter keyed by an HMAC of the normalized identity and platform-provided client address. Raw email/IP values are not stored. Provider 429 and 5xx failures remain distinct stable API errors and expose `Retry-After` when the application limiter knows it.

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
