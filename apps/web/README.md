# Expenso web

This directory contains the Expenso responsive web app and same-origin Node.js backend. It uses Next.js 16, React 19, TypeScript, Tailwind CSS, TanStack Query, and Supabase.

Use Node.js 22 or later:

```bash
npm ci
npm run dev
```

Run the complete baseline checks with:

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

Application source lives in `src/app`, reusable UI in `src/components`, shared contracts in `src/shared`, and server-only modules in `src/server`. The repository root contains the product blueprint and architecture handoff.
