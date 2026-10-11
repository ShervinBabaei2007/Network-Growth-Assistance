# LinkedIn Network Growth Assistant

Plans, prioritizes and tracks LinkedIn networking toward 2,000 connections, focusing on Computer Engineering, Electrical Engineering, Mechatronics and Computer Science at U of T, UBC, SFU and Waterloo.

The app never scrapes LinkedIn, never automates invitations and never asks for LinkedIn credentials. You send every invitation yourself. The app keeps the candidate list, decides who to contact next and records the results.

## Status

| Phase | Scope | State |
|---|---|---|
| 1 | Foundation: Next.js, Supabase schema + RLS, magic-link auth, app shell | Done |
| 2 | Dashboard: progress, discipline and university targets, connection snapshots, settings | Done |
| 3 | Candidate management: records, search, dedupe, classification, status, CSV import | Done |
| 4 | Prioritization and the daily queue | Done |
| 5 | Daily job and LinkedIn data export import | Done |
| 6 | Connection-note suggestions | Done |
| 7 | Analytics and end-to-end tests | Done |
| 8 | Production hardening, data export/deletion, deployment guide | Done |
| 9 | Network discovery: known connections, evidence-backed AI research, People CRM | Done |
| 10 | Jobs: recent postings from employers' own job boards (BC and Ontario first), free fit checks and tailored resume and cover letter, optional AI | Done |

To deploy, follow [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

## How a day works

0. **Add people fast:** on a LinkedIn people search (for example "Computer Engineering" with the School filter set to UBC), press Ctrl+A then Ctrl+C. On **Candidates → Quick capture**, press Ctrl+V. Everyone on the page appears with school and program filled in where their headline says them. Fix any blanks, then press **Add**. Repeat for the next results page. Only what you copied is read; the app never fetches anything from LinkedIn.
1. The daily job (or **Run now**) classifies new candidates, marks older invitations as pending and builds today's queue. It works in your discipline priority order, U of T and UBC first, with SFU and Waterloo as labelled alternates. It stays within your daily target and pause setting.
2. On **Daily Queue**, open each profile on LinkedIn and send the invitation yourself, with the suggested note if you like. Then press **Mark sent**.
3. When someone accepts, mark it on their record, or import LinkedIn's data export to update everyone at once.
4. **Overview**, **Disciplines**, **Universities** and **Analytics** update from what you've recorded. Nothing is estimated or invented.

## Network discovery

**Discover** is a research assistant for finding people worth meeting, for example "Find 50 UofT Computer Engineering alumni working as software engineers". It is not a LinkedIn tool: it never visits, searches or automates LinkedIn.

1. **Connections**: import your Connections.csv (or any contact list) so people you already know are left out. The LinkedIn data export import on Candidates → Import fills this list too. Emails are never stored, and the file isn't kept.
2. **Understand**: Claude turns the request into structured criteria (school and its aliases, programs, roles, companies, places, count). A built-in parser does it without a key. ECE is never treated as Computer Engineering unless you say so.
3. **Plan and search**: many small, targeted searches (alumni, design teams, labs, personal sites, the school's own site, GitHub), deduplicated, each excluding LinkedIn. Sources: GitHub's and ORCID's public APIs (no key), plus Brave Search for the open web when configured, all behind a `SearchProvider` interface.
4. **Evidence**: pages that mention the school are read (respecting robots.txt; LinkedIn URLs are never fetched). Claude extracts people, and **every fact must quote the page**. The server checks each quote and link against the page and drops anything it can't find. Confidence (high, medium, low) comes from rules, not from the model.
5. **Verify**: the top 30 people are checked on their own pages, without AI: their GitHub profile README and social links, and the website they list. Each line that states their school, program, class year (including UofT's "2T4"), role or employer becomes a quoted fact. Two independent sources agreeing raise a fact to high confidence (never for ECE vs Computer Engineering), and an "alumni" request doesn't verify someone who is still studying.
6. **Resolve and dedupe**: the same person across sources is merged only with a corroborating signal (same GitHub, site, or name plus employer and school); otherwise they're flagged as a possible duplicate. People matching your known connections are hidden (≥ 95%) or shown for review (75–95%). Your answers are remembered.
7. **Rank and explain**: a transparent score (education 30, program 25, career 15, company 10, location 10, evidence 10) with a per-line breakdown, then an optional Claude rerank that explains why each person is worth meeting, citing only verified facts.
8. **Act yourself**: every person has a LinkedIn button. **LinkedIn profile** opens the profile link the person published themselves (on GitHub, ORCID or their website). Otherwise **Find on LinkedIn** opens LinkedIn's people search for their name and employer or school; check it's the right person and paste their profile link in the drawer to keep it. Save people to **People**, track status, notes, tags and reminders, mark 2nd or 3rd degree if you checked LinkedIn yourself, copy a suggested intro, open their profile in a new tab, or send them to Candidates and the Daily Queue.

**No keys needed to start.** Without any API keys, Discover searches two free public sources whose data needs no AI to read: **GitHub** profiles (name, bio, company, location) and **ORCID** records (people's own education, with school, department, degree and years, and their employment, with employer and title). Requests are understood by a built-in parser, and matches are explained by their score breakdown. Working at a school is never counted as having studied there. Adding a free `GITHUB_TOKEN` (no permissions) raises GitHub's limit from about one search an hour. `BRAVE_SEARCH_API_KEY` and `ANTHROPIC_API_KEY` are optional upgrades: they add personal sites and team pages read by AI, and written explanations.

**Canada only.** Every search looks for people located in Canada. Location comes from evidence: a GitHub profile's location, the country on an ORCID record or the city of their current employer, "Based in Toronto" on their own page, or a web page. Someone shown to live elsewhere (for example "Seattle, WA") is left out and listed under "didn't qualify" with the reason. Someone whose location isn't public can't be verified and is shown as a possible match. Sources that disagree lower confidence. "Vancouver, WA" counts as the United States, and city names shared with other countries (London, Hamilton) only count with a province. Under **Modify**, a search can use another country, or none.

The research agent works in short, resumable steps with hard budgets (30 queries, 100 pages, 200 people, 60 AI calls per search). It stops when it has enough verified people, a budget runs out, or new searches stop finding new people. It returns fewer people rather than lowering the bar. Search results are cached for 3 days and pages for 14.

## Jobs

**Jobs** finds postings from the **last 24 hours in Canada**, British Columbia first, then Ontario (other provinces optional). It checks each one against your resume, and writes a **tailored resume and cover letter** from what your resume says. It needs **no API keys**, and the work it does outside the app grows with the number of employers, not users.

1. **Postings, from employers' own job boards.** A shared crawler reads the public job-board APIs behind employers' careers pages: Greenhouse, Lever, Ashby, SmartRecruiters, Workable and Recruitee. These APIs are free, need no key and exist so the postings get shown elsewhere. The crawler keeps Canadian jobs only, and every user reads the same table. Boards with Canadian jobs are read every 30 minutes, others every 6 hours, and failing boards back off up to a day. ETags skip boards that haven't changed. LinkedIn, Indeed and Glassdoor are never fetched; you apply on the employer's site.
2. **A shared employer directory.** It starts from `supabase/seed/employers.json`, about 110 employers hiring in Canada, found with `npm run employers:discover`. Anyone can add an employer under **Jobs → Employers** by pasting its careers page or board link; it's added once its board answers. **Coverage is the directory**: one hundred employers produce roughly 25–40 new Canadian jobs on a weekday, so a busy 24-hour feed needs thousands.
3. **The 24-hour rule.** A job's date is the employer's publish time. A board that gives no time (Workable gives only a date) is dated by when the job first appeared on a board already read. Jobs already on a board the first time it's read, with no time, are never shown as recent.
4. **Resume.** Upload a PDF (under 4 MB, with selectable text). It's read into jobs, projects, education and bullets without AI. Check it on **Jobs → Resume** and add what resumes don't say: work authorization, clearance, relocation. The PDF isn't kept.
5. **Fit, without AI.** Each requirement line in a posting is matched against your resume:
   - through a skills list with aliases ("Postgres" is PostgreSQL) and families ("React" partly meets "Vue")
   - by meaning, using Supabase's free built-in `gte-small` embedding model; on by default when `EMBED_SECRET` is set

   Every "met" quotes a real line of your resume. Rules decide years (from your dates), degree, clearance and work authorization. A posting is set aside under **Doesn't qualify**, with reasons, when a required licence or clearance is missing, your work authorization doesn't match, it asks for 3+ more years than you have, it needs a higher degree, or you meet under half its requirements. The rest are scored Strong, Good or Stretch.
6. **Tailoring, without AI.** **Tailor resume and cover letter** keeps every job and orders your own bullets by relevance. It leaves out unrelated projects and puts matched skills first. It uses the posting's name for a skill you already list under another name, and nothing else is reworded. The cover letter is a template from your best-matched lines. **Tailor anyway**, for a posting you don't qualify for, adds one honest sentence about the gap. Edit, then download PDF or Word.
7. **Optional AI rewording.** **Rewrite with AI** rewords the documents with Claude. It runs with your own Anthropic key (Settings, stored encrypted) or the app's key within a daily allowance (`AI_DAILY_QUOTA`, default 3). An accuracy check removes anything your resume doesn't support: new numbers, technologies, employers or skills.

Also: **Paste a posting** (from LinkedIn or anywhere, private to you), Saved / Applied / Not interested, and **Find people at {company}** in Discover.

## Stack

Next.js 16 (App Router, Cache Components), TypeScript, Tailwind v4, shadcn/ui (Base UI), Recharts, Supabase (Postgres, Auth, RLS), Zod, Vitest, pgTAP, Playwright. Optional: Anthropic SDK for note rewrites.

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
npm run test:e2e  # Playwright end to end (needs db:start; starts or reuses the dev server)
                  # Discover's e2e test needs the server running with DISCOVERY_FIXTURES=1 (set
                  # automatically when Playwright starts it); it is skipped otherwise. Jobs' e2e
                  # test likewise needs JOBS_FIXTURES=1.
npm run build
```

After changing a migration, run `npm run db:reset` and then `npm run db:types` to regenerate `src/lib/supabase/database.types.ts`.

## Environment variables

| Name | Where | Purpose |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | public | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | public | Browser/server key; access is enforced by RLS |
| `SUPABASE_SECRET_KEY` | server only | Bypasses RLS; used only by the daily job (cron and Run now) and account deletion, always for the verified user |
| `CRON_SECRET` | server only | Authenticates Vercel Cron calls to `/api/cron/daily` |
| `ANTHROPIC_API_KEY` | server only, optional | Claude rewrites of connection-note drafts; in Discover, request parsing, evidence extraction and explanations |
| `BRAVE_SEARCH_API_KEY` | server only, optional | Discover's public web search. Without it, Discover searches GitHub only |
| `GITHUB_TOKEN` | server only, optional (recommended) | Free; no scopes needed. Raises GitHub's limit for Discover from about one search an hour |
| `EMBED_SECRET` | server only, optional (recommended) | Jobs: turns on matching by meaning with the free `embed` Edge Function; set the same value as an Edge Function secret |
| `APP_ENCRYPTION_KEY` | server only, optional | Jobs: encrypts users' own Anthropic keys (32+ characters; never change it once keys are stored) |
| `AI_DAILY_QUOTA` | server only, optional | Jobs: AI rewrites per user per day on the server's `ANTHROPIC_API_KEY` (default 3; 0 = users' own keys only) |

## Data model

The schema is in `supabase/migrations/`. Every table is scoped to its owner by row-level security. Signing up creates default settings and the targets: 250 per discipline, including 125 at U of T and 125 at UBC. SFU and Waterloo are additional candidate pools and don't raise the 1,000 total.

Only accepted invitations count toward targets, and only when they were accepted on or after the project start date, the candidate's school and program are both confirmed, and the person wasn't already a connection. The counting rules live in `src/lib/progress/` with unit tests. Day and week figures use the time zone in Settings, and weeks start on Monday. Pending invitations are tracked separately, and the database allows only one open invitation per person.
