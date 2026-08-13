# Expenso

Expenso is a responsive expense-tracking and group-splitting web application. The current frontend lives in `apps/web` and is built with Next.js, React, TypeScript, and Tailwind CSS. The backend is being implemented as authenticated Next.js route handlers backed by Supabase Postgres, Auth, and Storage.

## Local development

Requirements: Node.js 22 or later and npm.

```bash
cd apps/web
npm ci
npm run dev
```

Quality checks:

```bash
npm run lint
npm run typecheck
npm run build
```

See [`docs/FRONTEND_ARCHITECTURE.md`](docs/FRONTEND_ARCHITECTURE.md) for the frontend handoff and [`EXPENSO_WEB_APP_MASTER_BLUEPRINT.md`](EXPENSO_WEB_APP_MASTER_BLUEPRINT.md) for the complete product contract.
