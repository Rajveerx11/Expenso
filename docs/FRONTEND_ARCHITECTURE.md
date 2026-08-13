# Expenso frontend architecture

## Purpose

This document records the cloned web frontend baseline before backend integration. It gives frontend and backend contributors the same map of screens, shared contracts, data ownership, and integration seams.

## Stack and runtime

- Next.js 16 App Router with React 19 and strict TypeScript.
- Tailwind CSS 4 plus shared CSS design tokens.
- TanStack Query provider for server-state caching.
- Supabase SSR and JavaScript clients are installed but not wired in this baseline.
- Responsive application shell: desktop sidebar and mobile bottom navigation.
- Node.js 22 or later is the supported runtime.

The app is a single web deployment. Browser pages and Node.js route handlers share the same Next.js project and domain. Supabase remains the managed Auth, Postgres, and Storage provider.

## Directory map

```text
apps/web/
├── public/                       PWA manifest and static assets
├── src/app/
│   ├── (auth)/                   Login and signup shell
│   ├── (dashboard)/              Authenticated product shell
│   │   ├── dashboard/            Monthly overview
│   │   ├── expenses/             Personal transaction flows
│   │   ├── groups/               Groups, members, splits, settlements
│   │   ├── notifications/        Notification inbox
│   │   └── profile/              Profile display and editing
│   ├── onboarding/               First-run profile completion
│   ├── layout.tsx                Root metadata and providers
│   └── page.tsx                  Entry route
├── src/components/
│   ├── layout/                   Responsive application chrome
│   └── ui/                       Reusable product components
└── src/lib/
    ├── types.ts                  Shared frontend domain contracts
    ├── mockData.ts               Temporary page fixtures
    └── utils.ts                  Money, date, class, and UPI helpers
```

## Route inventory

| Area | Routes | Current behavior |
|---|---|---|
| Authentication | `/login`, `/signup`, `/onboarding` | Forms and transitions use placeholders; Supabase Auth is not connected. |
| Dashboard | `/dashboard` | Renders monthly summary and recent transactions from mock data. |
| Personal finance | `/expenses`, `/expenses/new` | Filters and form UI work locally; persistence is a TODO. |
| Groups | `/groups`, `/groups/new`, `/groups/[groupId]`, settings, expense creation | Complete responsive UI backed by fixtures. |
| Settlements | settle and settlement-detail routes below a group | UPI and confirmation UX are present; persistence is a TODO. |
| Notifications | `/notifications` | Inbox interactions are local only. |
| Profile | `/profile`, `/profile/edit` | Profile UI uses fixture data; saving and uploads are TODOs. |

## Shared contracts

`src/lib/types.ts` is the initial boundary between the two contributors. Money is represented as a two-decimal string, never a JavaScript floating-point number. Public identifiers and timestamps are strings. API responses will use camelCase DTOs matching these types while the database keeps snake_case columns.

The backend must not return raw Supabase rows. Route handlers will authenticate the request, validate input, execute an RLS-protected query or database function, and map only allowed fields into these DTOs. Each client page will replace its `MOCK_*` import or TODO with a typed API function and TanStack Query mutation/query.

## Integration sequence

1. Add validated environment handling plus Supabase browser/server clients and session refresh proxy.
2. Add the versioned `/api/v1` response envelope, authentication, CSRF/origin checks, and profile endpoints.
3. Add personal transaction and dashboard endpoints.
4. Add group, membership, shared-expense, balance, settlement, storage, and notification endpoints.
5. Replace mock reads and placeholder submit handlers screen by screen.
6. Keep route-level loading, empty, error, and retry states explicit.

## Baseline limitations

- All product data is hard-coded fixture data.
- Login, signup, Google OAuth, logout, onboarding, CRUD, uploads, and notifications are not connected.
- No middleware/proxy or route-handler authorization exists yet.
- No automated product tests exist yet; CI currently enforces lint, TypeScript, and production build.
- The old Android source was intentionally removed by the cloned web-app replacement and is available in Git history. The Supabase migrations, functions, and database tests remain versioned as the backend source of truth.

These limitations define the backend and integration work; they are not advertised as production-ready behavior.
