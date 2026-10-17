# Network Growth Assistant

A free web app that helps you grow a professional network and run a job search in one place. It keeps your lists, tells you who to contact next, finds recent jobs from employers' own career pages, and tracks every application.

**You stay in control.** The app never scrapes LinkedIn, never sends invitations for you, and never asks for your LinkedIn password. You send every message yourself.

## Contents

1. [What it does](#what-it-does)
2. [How a day works](#how-a-day-works)
3. [Quick start](#quick-start)
4. [Configuration](#configuration)
5. [Running the checks](#running-the-checks)
6. [Deploying](#deploying)
7. [How it is built](#how-it-is-built)
8. [Privacy and data](#privacy-and-data)
9. [Troubleshooting](#troubleshooting)
10. [Limits](#limits)
11. [Contributing and licence](#contributing-and-licence)

## What it does

| Area | What you get |
|---|---|
| **Network** | Candidates with search, de-duplication and status. Quick capture from a LinkedIn search page you copy yourself. CSV and LinkedIn data-export import. A daily queue ordered by your priorities, with suggested connection notes. |
| **Discover** | A research assistant that finds people worth meeting from public sources (GitHub, ORCID and optional web search). Every fact quotes its source. It never visits LinkedIn. |
| **People** | A small CRM: status, notes, tags, reminders, referrals and "people at this company". |
| **Jobs** | Recent postings from employers' own job boards, plus free remote-job feeds. Verified links, fit checks against your resume, tailored resumes and cover letters, and saved-search alerts. |
| **Applications** | A board and list from saved to offer, with timeline, interviews, reminders, contacts, documents and calendar (`.ics`) export. |
| **Overview and Analytics** | Progress toward your goal, by discipline and school. Nothing is estimated or invented. |
| **Your account** | Sign in with Google or an email link. Export or delete all your data from Settings. Light and dark themes, adjustable density and text size. |

You choose your own schools, disciplines, targets and connection goal. Nothing is built in.

For the detail behind Discover and Jobs, see the [feature guide](docs/FEATURES.md).

## How a day works

1. **Add people fast.** On a LinkedIn people search, press Ctrl+A then Ctrl+C. In **Candidates → Quick capture**, press Ctrl+V. Everyone on the page appears, with school and program filled in where the headline says them. Fix any blanks, then press **Add**. Only what you copied is read.
2. **Let the daily job run** (or press **Run now**). It classifies new candidates, marks older invitations as pending and builds today's queue within your daily target.
3. **Work the queue.** Open each profile on LinkedIn, send the invitation yourself, then press **Mark sent**.
4. **Record acceptances.** Mark them on the person's record, or import LinkedIn's data export to update everyone at once.
5. **Check progress** on Overview, Disciplines, Schools and Analytics.
6. **Search jobs.** Save a search to get alerts, track what you apply for, and look up people you know at each company.

## Quick start

You need **Node 24** and **Docker Desktop** (running).

```sh
npm install
npm run db:start            # starts local Supabase in Docker and applies migrations
cp .env.example .env.local
npx supabase status         # copy the publishable key and secret key into .env.local
npm run dev                 # http://localhost:3000
```

Then:

1. Set `CRON_SECRET` in `.env.local` to any random string of 16 or more characters.
2. Open http://localhost:3000 and enter your email.
3. Local sign-in emails never leave your machine. Open **Mailpit** at http://127.0.0.1:54324 and click the link.

Google sign-in works only on a deployed site that has Google configured. Locally, use the email link.

> **Careful with `npm run db:reset`.** It erases your local database. If it holds data you want, apply new migrations with `npx supabase migration up --local` instead.

## Configuration

Copy `.env.example` to `.env.local` for local work. On Vercel, add the same names under **Settings → Environment Variables** for the **Production** environment. Variable names must match exactly: a misspelled name is silently ignored.

**Required**

| Name | Purpose |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Your project address, such as `https://<ref>.supabase.co`. Not the dashboard address. |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Browser key. Access is enforced by row-level security. |
| `SUPABASE_SECRET_KEY` | Server only. Bypasses row-level security. Used by scheduled jobs and account deletion. |
| `CRON_SECRET` | Server only. Authenticates scheduled calls to `/api/cron/*`. Must match the value Supabase stores for its scheduled calls. |

**Recommended**

| Name | Purpose |
|---|---|
| `GEMINI_API_KEY` | Free key from [Google AI Studio](https://aistudio.google.com/apikey). Turns on AI features. Without it, every feature uses its non-AI path. |
| `AI_DAILY_QUOTA` | AI uses per user per day on your key. Unset means no limit, so set it on a public site. `0` means users' own keys only. |
| `APP_ENCRYPTION_KEY` | 32+ random characters. Lets users store their own AI key. Never change it once keys are stored. |
| `EMBED_SECRET` | 16+ random characters. Turns on matching by meaning (see [Deploying](#deploying)). |
| `GITHUB_TOKEN` | Free token with no scopes. Raises GitHub's limit for Discover. |
| `NEXT_PUBLIC_CONTACT_EMAIL`, `NEXT_PUBLIC_OPERATOR_NAME` | Shown on the Privacy Policy and Terms pages. Set them before launch. |
| `NEXT_PUBLIC_FEEDBACK_URL` | A `mailto:` or form link. Shows a **Send feedback** button in the navigation. |

**Optional**

| Name | Purpose |
|---|---|
| `GEMINI_MODEL` | Gemini model to use. Default `gemini-3.8-flash`. |
| `ANTHROPIC_API_KEY` | Use Anthropic Claude when `GEMINI_API_KEY` is not set. |
| `BRAVE_SEARCH_API_KEY` | Adds public web search to Discover. |
| `CAREERJET_API_KEY` | Adds Careerjet to job searches (free publisher key). |
| `ADZUNA_APP_ID`, `ADZUNA_APP_KEY` | Adds Adzuna to job searches. |
| `USAJOBS_API_KEY`, `USAJOBS_EMAIL` | Adds U.S. federal jobs. |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` | Email digests for saved-search alerts. |
| `APP_URL`, `EMAIL_TOKEN_SECRET` | Also needed for alert emails (links and one-click unsubscribe). `EMAIL_TOKEN_SECRET` needs 32+ characters. |

Alert emails switch on only when `SMTP_HOST`, `SMTP_FROM`, `APP_URL` and `EMAIL_TOKEN_SECRET` are all set, and each person opts in. Otherwise alerts appear only in the app.

**Tests only.** `DISCOVERY_FIXTURES` and `JOBS_FIXTURES` switch on built-in fictional data. Never set them in production. They are ignored in production builds.

Sign-in email for other people needs custom SMTP in Supabase (Authentication → Emails → SMTP Settings). Supabase's built-in email reaches only your own team.

## Running the checks

```sh
npm run typecheck
npm run lint
npm test              # Vitest unit tests
npm run test:db       # pgTAP: security rules and data constraints (needs db:start)
npm run test:e2e      # Playwright end to end (needs db:start)
npm run build
npm run check:bundle  # confirms no AI key reaches the browser (run after build)
```

The last full run passed 859 unit tests, 217 database tests and 18 end-to-end tests, plus the build and the bundle check.

After you change a migration, run the new migration locally, then `npm run db:types` to regenerate `src/lib/supabase/database.types.ts`.

Accessibility: a unit test (`src/lib/contrast.test.ts`) checks colour contrast for every text and form-field pair in both themes. It does not replace an automated scan or a screen-reader review, which are still to do.

## Deploying

The app runs on **Vercel** (web app and one daily job) and **Supabase** (database, sign-in, file storage and an optional embedding function). The full, step-by-step guide is in [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md). In short:

1. Create a Supabase project, then link it and apply the migrations:
   ```sh
   npx supabase login
   npx supabase link --project-ref <your-project-ref>
   npx supabase db push
   ```
2. Import the repository in Vercel and add the environment variables above.
3. In Supabase **Authentication → URL Configuration**, set **Site URL** to your Vercel address and add it, with `/**`, to **Redirect URLs**.
4. Set up custom SMTP, and Google sign-in if you want it.
5. Load the employer directory: `npm run employers:load` (with the project URL and secret key in your environment).
6. Schedule the job crawler (every 5 minutes) and the alerts job (every 15 minutes) with Supabase `pg_cron`. Vercel's free plan runs a cron only once a day. The SQL is in the deployment guide.
7. Optional: `npx supabase functions deploy embed`, for matching by meaning.

The app serves `robots.txt` with `Disallow: /` while in beta. Delete `src/app/robots.ts` when you want search engines to find it.

## How it is built

**Stack.** Next.js 16 (App Router, Cache Components), TypeScript, Tailwind v4, shadcn/ui on Base UI, Recharts, Supabase (Postgres, Auth, Storage, RLS), Zod, Vitest, pgTAP and Playwright. AI is Google's Gemini over REST, with optional Anthropic.

```text
src/app/(app)/     signed-in pages: overview, queue, candidates, discover, people,
                   jobs, applications, companies, notifications, settings, analytics
src/app/api/       cron jobs (daily, crawl, alerts), export, email unsubscribe, JSON endpoints
src/app/login/     sign-in (Google and email link); privacy and terms pages are public
src/lib/           the logic: job-postings, discovery, ai, alerts, applications,
                   progress, classify, net (safe fetching), server, email
src/components/    shared interface pieces
src/proxy.ts       refreshes the session and sends signed-out visitors to /login
supabase/          migrations, pgTAP tests, seed employers, the embed function
e2e/               Playwright tests and fixtures
scripts/           employer directory tools and the client-bundle check
docs/              deployment guide, feature guide, implementation checklist
```

**Design rules worth knowing**

- Every table is protected by row-level security and scoped to its owner. Client input never names the user.
- Fetching outside URLs goes through `src/lib/net/safe-fetch.ts`, which refuses private and reserved addresses.
- Scores, rankings and fit are computed by rules, never by a model. AI writes text, and its output is checked before use.
- Counting rules for targets live in `src/lib/progress/`, with unit tests. Only accepted invitations count, and only when the person's school and program are confirmed.
- AI keys never reach the browser. `npm run check:bundle` checks the built files.

## Privacy and data

- Everything is stored only for your account. Your LinkedIn password and cookies are never stored. Email addresses in imported files are not stored, and the files are not kept.
- Settings can export everything in your account and delete it for good.
- When you use an AI feature, the text it needs (for example your resume and a job posting) goes to the AI provider. **On Gemini's free tier, Google may use it to improve its products.** Use a paid key, or skip AI features, if that matters to you.
- The site has a [Privacy Policy](src/app/privacy/page.tsx) and [Terms of Service](src/app/terms/page.tsx), written to follow British Columbia law. They are a starting point, not legal advice. Have them reviewed before a wide launch.

## Troubleshooting

| Symptom | Likely cause and fix |
|---|---|
| Google button shows a Supabase page, or a "not found" page | `NEXT_PUBLIC_SUPABASE_URL` holds the dashboard address. It must be `https://<ref>.supabase.co`. Fix it and redeploy. |
| `Unsupported provider: provider is not enabled` | Turn on Google in Supabase **Authentication → Sign In / Providers** and paste the client ID and secret. |
| Sign-in sends people to a Vercel "request access" page | **Site URL** in Supabase is wrong. Use your public Vercel address, with no path. |
| Scheduled crawl returns `401` | `CRON_SECRET` in Vercel differs from the one stored in Supabase. They must match exactly. Redeploy after changing it. |
| Jobs page is empty | Run `npm run employers:load`, then schedule the crawler. First results take about 10 minutes. |
| "Email isn't set up on this server" in Settings | One of `SMTP_HOST`, `SMTP_FROM`, `APP_URL` or `EMAIL_TOKEN_SECRET` is missing, misspelled, or not set for Production. Redeploy afterwards. |
| Sign-in email never arrives | Supabase needs custom SMTP for anyone outside your team. Check spam, too: free sender addresses are often filtered. |
| A new variable has no effect | Variables apply only to new deployments. Redeploy, and for `NEXT_PUBLIC_` ones, rebuild. |

## Limits

- Job coverage follows the employer directory. Large retailers and many big employers use systems with no public API, so in-store retail jobs stay thin. The app does not scrape.
- Jobicy and Remotive list only remote jobs, and Remotive's arrive a day late.
- Gemini's free tier has daily request limits. When they run out, Tailor Resume gives improvement notes instead.
- Links on sites that block automated checks stay **Not yet verified**.
- Still open: restoring from a backup, a staging deployment with smoke checks, a performance budget, and an automated accessibility scan.

## Contributing and licence

Questions, bug reports and ideas are welcome. Please open an issue, or use the **Send feedback** button in the app. If you plan to send a change, run the checks above first and keep the change small and focused.

No licence has been chosen yet, so all rights are reserved. Please ask before reusing the code.

This project is not affiliated with LinkedIn, Google or any employer.
