# LinkedIn Network Growth Assistant

Plans, prioritizes and tracks LinkedIn networking toward 2,000 connections, focusing on Computer Engineering, Electrical Engineering, Mechatronics and Computer Science at U of T, UBC, SFU and Waterloo.

The app never scrapes LinkedIn, never automates invitations and never asks for LinkedIn credentials. You send every invitation yourself. The app keeps the candidate list, decides who to contact next and records the results.

## Status

| Phase | Scope | State |
|---|---|---|
| 1 | Foundation: Next.js, Supabase schema + RLS, magic-link auth, app shell | Done |
| 2 | Dashboard: progress, discipline and university targets, connection snapshots | Next |
| 3–8 | Candidates, prioritization, daily job, notes, analytics, deployment | Planned |

## Stack

Next.js 16 (App Router, Cache Components), TypeScript, Tailwind v4, shadcn/ui (Base UI), Supabase (Postgres, Auth, RLS), Zod, Vitest, pgTAP.

## Local setup

Prerequisites: Node 24, Docker Desktop (running).

```sh
npm install
npm run db:start          # starts local Supabase in Docker and applies migrations
cp .env.example .env.local
npx supabase status       # copy PUBLISHABLE_KEY and SECRET_KEY into .env.local
npm run dev               # http://localhost:3000
```

Set `CRON_SECRET` in `.env.local` to any random string of 16+ characters.

Sign-in emails don't leave your machine during local development. Open Mailpit at http://127.0.0.1:54324 to click the magic link.

## Checks

```sh
npm run typecheck
npm run lint
npm test          # Vitest unit tests
npm run test:db   # pgTAP: RLS isolation and data constraints (needs db:start)
npm run build
```

After changing a migration, run `npm run db:reset` and then `npm run db:types` to regenerate `src/lib/supabase/database.types.ts`.

## Environment variables

| Name | Where | Purpose |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | public | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | public | Browser/server key; access is enforced by RLS |
| `SUPABASE_SECRET_KEY` | server only | Bypasses RLS; used only by the daily job |
| `CRON_SECRET` | server only | Authenticates Vercel Cron calls to `/api/cron/daily` |
| `ANTHROPIC_API_KEY` | server only, optional | Claude rewrites of connection-note drafts |

## Data model

The schema is in `supabase/migrations/`. Every table is scoped to its owner by row-level security. Signing up creates default settings and the targets: 250 per discipline, including 125 at U of T and 125 at UBC. SFU and Waterloo are additional candidate pools and don't raise the 1,000 total.

Only accepted invitations count toward targets. Pending invitations are tracked separately, and the database allows only one open invitation per person.
