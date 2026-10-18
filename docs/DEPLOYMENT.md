# Deploying the Network Growth Assistant

The app runs on **Vercel** (web app and daily cron) and **Supabase** (Postgres and email sign-in). Both have free tiers that cover one person's use. The whole setup takes about 20 minutes. For what the app does, see the [README](../README.md) and the [feature guide](FEATURES.md).

## What you need

- A GitHub account. The code should be in a **private** repository.
- A Vercel account, connected to GitHub.
- A Supabase account.
- Recommended: a free Gemini API key from Google AI Studio (https://aistudio.google.com/apikey), for the "Suggest with AI" button on connection notes, Discover's reading of web pages, and Jobs' AI tailoring. Without it, every feature uses its non-AI path.
- Nothing else. Jobs needs no keys: employer boards, Jobicy and Remotive are free public APIs. Anthropic and Adzuna are not required (both still work as optional extras).

## 1. Push the code to GitHub

```sh
gh repo create linkedin-network-growth --private --source . --push
```

Or create an empty private repository on github.com and push to it.

## 2. Create the Supabase project

1. In the Supabase dashboard, create a project. Pick the region closest to your users, and plan to put the Vercel functions next to it (see "Keep the app and the database in the same region" in step 3). The reference deployment uses `us-west-2` (Oregon) with Vercel's `pdx1`.
2. Link this repository to it, then apply every migration:

   ```sh
   npx supabase login
   npx supabase link --project-ref <your-project-ref>
   npx supabase db push
   ```

   `db push` creates the tables, row-level security policies, functions and the signup trigger from `supabase/migrations/`. Run it **before or together with** every deploy that adds a migration. The newest one stores the welcome guide and tour progress (`settings.onboarding`); if a new build runs against an older database, the app keeps working, the welcome and tour fall back to a fresh state with nothing saved, and the server logs `Couldn't read onboarding state`.
3. Under **Authentication → URL Configuration**:
   - **Site URL**: `https://<your-app>.vercel.app`
   - **Redirect URLs**: add `https://<your-app>.vercel.app/**`
4. Under **Authentication → Emails → SMTP Settings**, set up custom SMTP if anyone other than you will sign in. Without it, Supabase's built-in email service only delivers to members of your Supabase team and sends very few emails per hour. Any SMTP provider works; Resend and Brevo have free tiers.
5. Under **Project Settings → API Keys**, copy the **Publishable key** and a **Secret key** for the next step.

## 3. Deploy on Vercel

1. In Vercel, choose **Add New → Project** and import the repository. The defaults are correct (Next.js, `npm run build`).
2. Add these environment variables for **Production**. They are also listed in `.env.example`.

   | Name | Value |
   |---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | `https://<project-ref>.supabase.co` |
   | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | The publishable key |
   | `SUPABASE_SECRET_KEY` | The secret key. Server only, never expose it. |
   | `CRON_SECRET` | A long random string, e.g. from `openssl rand -hex 32` |
   | `GEMINI_API_KEY` | Recommended, free. The default AI (Google AI Studio key). Server only: never name it `NEXT_PUBLIC_…`. Leave unset to keep AI off. |
   | `GEMINI_MODEL` | Optional. Default `gemini-3.8-flash`. Any Gemini model with structured output. |
   | `ANTHROPIC_API_KEY` | Optional, not required. Used only when `GEMINI_API_KEY` isn't set. |
   | `BRAVE_SEARCH_API_KEY` | Optional. Enables Discover's public web search. |
   | `GITHUB_TOKEN` | Optional. A token with no scopes; raises GitHub's rate limit for Discover. |
   | `EMBED_SECRET` | Recommended. Any random string of 16+ characters; turns on Jobs' matching by meaning (step 3b). |
   | `APP_ENCRYPTION_KEY` | Optional. 32+ random characters (`openssl rand -hex 32`); lets users store their own AI key (Gemini, or Anthropic). Never change it once keys are stored. |
   | `AI_DAILY_QUOTA` | Optional. AI uses (tailoring, notes, AI resume reading) per user per day on your server key (unset = no limit; `0` = users' own keys only). Without a limit, every user's AI runs on your key: watch your Gemini usage and billing. |
   | `ADZUNA_APP_ID`, `ADZUNA_APP_KEY` | Optional, not required. With both, Jobs also searches Adzuna (whose free allowance is small). |
   | `CAREERJET_API_KEY` | Optional. A free publisher key; adds Careerjet to job searches (step 3b.6). |
   | `USAJOBS_API_KEY`, `USAJOBS_EMAIL` | Optional. Adds U.S. federal jobs (step 3b.6). |
   | `APP_URL` | Your public address, for example `https://<your-app>.vercel.app`. The sitemap and canonical links use it (they default to Vercel's production domain when it is unset), and alert emails need it. Set it if you add a custom domain. |
   | `NEXT_PUBLIC_CONTACT_EMAIL`, `NEXT_PUBLIC_OPERATOR_NAME` | Set before launch. Shown on the Privacy Policy and Terms pages. |
   | `NEXT_PUBLIC_FEEDBACK_URL` | Optional. A `mailto:` or form link; shows a **Send feedback** button in the navigation. |
   | `SMTP_*`, `EMAIL_TOKEN_SECRET` | Optional. Alert emails (step 3c). |

   Never set `JOBS_FIXTURES` or `DISCOVERY_FIXTURES` in production. They are ignored in production builds anyway, so fictional data can't appear.

3. Deploy.

Vercel reads `vercel.json` and registers the daily job (`/api/cron/daily`, scheduled for 12:00 UTC, which is early morning in Canada). Vercel automatically sends `Authorization: Bearer $CRON_SECRET` with each cron call, and the route rejects calls without it.

**Keep the app and the database in the same region.** Every page makes several database calls, and each one pays the distance between them. `vercel.json` pins the functions to `pdx1` (Portland) because the Supabase project is in `us-west-2` (Oregon). If your Supabase project is somewhere else, change `regions` to the nearest Vercel region (for example `iad1` for `us-east-1`, `cle1` for Ohio, `fra1` for Frankfurt) and redeploy. After a deploy, the `x-vercel-id` response header starts with the region the request ran in.

## 3b. Set up Jobs (no API keys needed to start)

1. **Load the employer directory** (tech employers first, plus non-tech and international ones found by `npm run employers:discover -- scripts/employer-candidates-worldwide.txt`) with your Supabase URL and secret key in the environment:

   ```sh
   NEXT_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co SUPABASE_SECRET_KEY=<secret> npm run employers:load
   ```

   To find more employers, add names to `scripts/employer-candidates.txt` and run `npm run employers:discover`, then load again. Users can also add employers under **Jobs → Employers**.

2. **Schedule the crawler every 5 minutes** with Supabase's pg_cron and pg_net (both on the free plan). Vercel Hobby crons run only once a day. In the Supabase SQL editor, enable both extensions under **Database → Extensions**, then run:

   ```sql
   select vault.create_secret('https://<your-app>.vercel.app', 'app_url');
   select vault.create_secret('<your CRON_SECRET>', 'cron_secret');
   select cron.schedule('jobs-crawl', '*/5 * * * *', $$
     select net.http_post(
       url := (select decrypted_secret from vault.decrypted_secrets where name = 'app_url') || '/api/cron/crawl',
       headers := jsonb_build_object('Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')),
       timeout_milliseconds := 90000
     );
   $$);
   ```

   Each tick reads up to 150 due boards in under a minute. Workday career sites (most large employers) are read page by page, so they come round every 3 hours instead of 30 minutes. With many employers, Vercel Pro lets the crawl route run longer: raise `maxDuration` in `src/app/api/cron/crawl/route.ts` to 300. To stop it: `select cron.unschedule('jobs-crawl');`.

3. **Deploy the embedding function** (Supabase's built-in `gte-small` model; no key, billed only as Edge Function CPU time):

   ```sh
   npx supabase functions deploy embed --project-ref <ref>
   npx supabase secrets set EMBED_SECRET=<the same value as in Vercel> --project-ref <ref>
   ```

   Without it, fit checks still work from the skills list alone.

4. **Resume files** are stored in a private Supabase Storage bucket named `resumes`, which the migration creates with per-user access rules. Nothing to configure; check under **Storage** that the bucket exists and is not public. Deleting a resume or an account removes its files.

5. **Jobicy and Remotive need nothing.** Searches ask Jobicy's public API (no key; each answer reused for an hour, as Jobicy asks). The crawl cron reads Remotive's public feed at most every 6 hours (Remotive asks for at most 4 reads a day). New listings from both start "not yet verified"; the crawl cron checks them with whatever time each tick has left (Jobicy jobs first through Jobicy's free status endpoint), and a listing becomes Apply-able only once its link checks out. Both sites ask to be credited and linked: the app shows the source on every job and links only to their listing pages.

6. **Recommended: Careerjet search.** Create a free publisher account at https://www.careerjet.com/partners/ and set `CAREERJET_API_KEY` in Vercel. Searches on the Jobs page then also ask Careerjet (90+ countries; cached for 30 minutes per search). Careerjet requires the searcher's IP address and browser with each request, so the page passes them along; alerts never call it.

   **Optional: Adzuna search.** Set `ADZUNA_APP_ID` and `ADZUNA_APP_KEY` in Vercel. Searches then also ask Adzuna (cached for 30 minutes per search). Its free plan is small (25 calls while pending, then 250 a day).

   **Arbeitnow** (Europe and the UK) needs nothing: the crawl cron reads its newest feed pages at most every 6 hours. **Optional: USAJOBS** (U.S. federal jobs): request a free key at https://developer.usajobs.gov/apirequest/ and set `USAJOBS_API_KEY` and `USAJOBS_EMAIL` (the email you requested it with).

7. **Check that no AI key reaches the browser** after a build: `npm run build && npm run check:bundle` (set `GEMINI_API_KEY` to a dummy value for both commands to also search for the value itself).

## 3c. Alerts, notifications and optional email

1. **Schedule the alerts job every 15 minutes**, next to the crawler (same Vault secrets as above):

   ```sql
   select cron.schedule('alerts', '*/15 * * * *', $$
     select net.http_post(
       url := (select decrypted_secret from vault.decrypted_secrets where name = 'app_url') || '/api/cron/alerts',
       headers := jsonb_build_object('Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')),
       timeout_milliseconds := 90000
     );
   $$);
   ```

   Each run:
   - checks saved searches whose time has come, reading stored jobs only;
   - creates notifications for due reminders, interviews in the next 24 hours, Monday summaries and job boards that stopped working;
   - sends queued emails.

   It is safe to run twice at once or to retry: each search is leased while it runs, and every notification and email is keyed so it can't repeat. A search whose run fails is retried on the next call; its new jobs aren't lost.

2. **In-app notifications need nothing else.**

3. **Optional: email digests over SMTP.** Any provider's SMTP works (Resend, Brevo, Postmark, Amazon SES, your own server). In Vercel, set:
   - `SMTP_HOST` and `SMTP_PORT`. Port 465 uses TLS from the start; 587 upgrades with STARTTLS.
   - `SMTP_USER` and `SMTP_PASS`.
   - `SMTP_FROM`, for example `Network Growth <alerts@your-domain.example>`.
   - `APP_URL`, for example `https://<your-app>.vercel.app`.
   - `EMAIL_TOKEN_SECRET`: 32+ random characters, used to sign unsubscribe links. Changing it breaks the links in emails already sent.

   With these set, users can turn on alert emails in **Settings → Notifications** and on each saved search. Both switches must be on.

   **Your part (not checked by the app):**
   - Verify the sending domain with your provider (SPF and DKIM; DMARC recommended).
   - Check the provider's sending limits.

   **What the emails contain and how they're sent:**
   - Each email has a one-click unsubscribe (`List-Unsubscribe` headers, RFC 8058) and visible links.
   - Emails contain job titles, companies and links only: no resume content, tracking pixels or click tracking.
   - Delivery is **at least once**. A failed send is retried after 15 minutes and then after an hour, then marked failed. A crash right after a send can repeat one email.

4. **Retention:**
   - Read notifications are deleted after 90 days.
   - Sent or skipped email records are deleted after 30 days, by the daily job.
   - A saved search keeps the list of jobs it has already seen while those jobs exist.

## 4. Check that it works

1. Open the site and sign in with your email. The link arrives from Supabase. The first time, a short welcome appears: choose a goal (network, jobs or both), and the navigation shows what matches it, with the rest under **More**.
2. On **Overview**, enter your starting connection count. **Help → Take the tour** walks through every page (18 stops).
3. In **Settings**:
   - Enter "About you" and your daily invitation target.
   - Press **Run now** under Daily job. The run history should show `succeeded`.
4. In the Vercel dashboard under **Settings → Cron Jobs**, confirm `/api/cron/daily` is listed. You can trigger it there too.
5. Optionally, call the cron route by hand. It should return counts only:

   ```sh
   curl -H "Authorization: Bearer $CRON_SECRET" https://<your-app>.vercel.app/api/cron/daily
   ```

## Free-tier limits that matter here

These are from the providers' pricing pages at the time of writing. Check the current terms before relying on them.

- **Vercel Hobby**
  - Cron jobs run **at most once a day**, and only within the scheduled hour, not at an exact minute. The app is designed for this, and you can always press **Run now** or **Refresh today's queue**.
  - Hobby is for personal, non-commercial use.
  - Request bodies are capped at 4.5 MB, so uploads are limited to 4 MB, and each LinkedIn export import to 3.5 MB.
  - The cron route is limited to 60 seconds. That covers many workspaces; with lots of users, split the job or upgrade.
- **Supabase Free**
  - 500 MB database. The app stores a few KB per candidate, so tens of thousands of candidates fit.
  - Projects **pause after a week without activity**. The daily cron touches the database every day, which keeps the project active.
  - No point-in-time backups. Use **Settings → Download all my data** for your own backup.
  - Built-in email is limited (see step 2.4).
- **Gemini (recommended, free tier)**
  - The Gemini Developer API's free tier covers Flash models at no cost, with per-minute and per-day request limits (see your limits in Google AI Studio). When they're reached, AI calls fail cleanly: Tailor Resume gives Improvement Notes, and the rest of the app works the same.
  - **Privacy:** on the free tier, Google may use the prompts and answers (resume text, postings) to improve its products; on the paid tier it says it doesn't. Tell your users, or use a paid key.
  - AI on your key isn't limited per user unless you set `AI_DAILY_QUOTA`.
- **Anthropic (optional, not required)**
  - Pay-as-you-go. Used only if you set `ANTHROPIC_API_KEY` without `GEMINI_API_KEY`, or a user adds their own Anthropic key.

- **Discover**
  - Works with no keys at all: GitHub and ORCID are free public APIs, and their data is read without AI. Set a free `GITHUB_TOKEN`; without it GitHub allows only about one search an hour.
  - Each user can run 20 searches a day, one at a time. A search is capped at 30 queries, 100 pages and 60 AI calls.
  - Brave Search bills per query; at most 30 per search, fewer when cached (search results are cached for 3 days).
  - Page reading (one call per relevant page), understanding the request and explaining the top matches use your Gemini model (`GEMINI_MODEL`). On the free tier, a large search can reach the per-minute limit: then the request is understood by the built-in parser, matches are explained by their score breakdown, and pages that couldn't be read add no people.
  - Research runs in steps of up to 60 seconds, driven by the results page while it's open. Closing the tab pauses a search; reopening it continues. A search left for 10 minutes is cancelled when you start a new one.

- **Jobs**
  - No API keys. The crawler reads each employer's public board at most every 30 minutes, whatever the number of users. In a local test, 114 boards took 12 seconds and stored about 1,600 jobs for Canada. Only jobs open to a country some user searches are kept, so storage grows with the countries people choose (each country adds roughly what its share of the boards lists); keep an eye on the 500 MB free database if users pick many countries.
  - Jobicy: one call per new search (and per later page), shared by everyone searching the same words within an hour. Remotive: at most 4 calls a day in total.
  - Coverage grows with the directory, not with keys: about 100 employers gave roughly 25–40 new Canadian jobs on a weekday.
  - Matching by meaning embeds requirements of open jobs from the last 90 days (the feed's longest range), newest first, at about 55 ms of Edge Function CPU each, in batches of 16. Resume lines are embedded once per upload.
  - Fit checks and free tailoring run in the app: one database call per page of jobs, no AI.
  - Optional AI rewording uses your Gemini model: one call per rewrite, plus up to one retry. It runs on the user's own key, or on yours (limited per user only if you set `AI_DAILY_QUOTA`).
  - Jobs no longer on their board are closed after 3 days. Closed jobs are deleted after 30 days unless someone saved or applied to them. The resume PDF is never stored, only its text.

Running costs are $0: Gemini's free tier, free job APIs and free hosting tiers. Only optional extras (a paid Gemini tier, Anthropic, Brave) cost money.

### At tens of thousands of users

The free plans aren't meant for this, and the limits that bind are hosting, not APIs:

- **Vercel:** Hobby is for non-commercial use only, so a public app needs Pro.
- **Supabase Free:** it allows 50,000 monthly active users, but only 500 MB of database, 5 GB of egress and 500K Edge Function calls a month. Expect to need Pro.

Both are flat monthly fees, not per-user costs. The crawler, the job table and the embeddings are shared, so they don't grow with users. Per-user storage is a resume, its lines, fit results for viewed jobs and tailored documents.

## Operating it

- **Logs**: Vercel → Project → Logs.
  - Cron jobs write one JSON line per run, for example `{"level":"info","scope":"cron.daily","event":"finished",…}`, and failures use `"level":"error"`. Search the logs for `"scope":"cron.` to see every run.
  - Page errors are prefixed `[app]`, `[queue]` or `[analytics]`.
  - Logs carry ids, counts and short error messages only. Keys, tokens and emails are redacted (`src/lib/server/log.ts`), and resume or posting text is never logged.
- **Daily job failures**: they appear in **Settings → Daily job** with the error. The next cron call retries a failed day automatically, and **Run now** retries it immediately.
- **Rotating secrets**: change `CRON_SECRET` or `SUPABASE_SECRET_KEY` in Vercel and redeploy. Rotate the Supabase key in its dashboard first.
- **Schema changes**: add a migration under `supabase/migrations/`, then test it locally:
  1. Apply it with `npx supabase migration up --local`, which keeps your local data. `npm run db:reset` also works, but it wipes the local database.
  2. Run `npm run test:db`.

  Then `npx supabase db push`. Migrations are additive where possible, so the previous deployment keeps working while a new one rolls out. See "Recovering from a bad deploy" below.
- **Rate limits**: expensive actions are limited per user in the database (`rate_limits`, `hit_rate_limit()`):
  - refreshing boards: 6 per hour
  - new-country searches: 3 per day
  - fit checks: 60 per hour
  - resume uploads: 20 per day
  - exports: 10 per hour

  Change them in `src/lib/server/rate-limit.ts`. Old counters are deleted by the daily job.
- **Deleting data**: each user can delete individual candidates, or their whole account under **Settings → Your data**. Account deletion cascades to every table.

## Smoke checks after each deploy

1. Sign in, and open **Overview**, **Jobs**, **Applications** and **Settings**. Each should load without an error message.
2. On a job, press **Save**. It should appear on **Applications** under Saved. Move it to Applied, then press **Undo** in the toast.
3. In **Settings → Appearance**, switch to Dark and reload: the page should come back dark, with no flash of light.
4. **Settings → Your data → Download** should return a JSON file with `schemaVersion` and an `applications` list.
5. Call the cron routes with the secret, as in step 4 of "Check that it works". Each should answer `{"ok":true,…}`.
6. Open **Help → Take the tour** and press Next once or twice: a popover should appear on each page. If the page opens with no popover, the latest migration probably wasn't applied (`npx supabase db push`).
7. On a phone (or a 390 px wide window), open the menu, then **Candidates**: the list should show as cards, not a squeezed table, and nothing should scroll sideways.
8. Reload `/robots.txt`, `/sitemap.xml` and `/llms.txt`: each should answer 200 without signing in.

### Automated smoke checks

`npm run smoke -- https://<your-app>` runs the checks that need no sign-in (public pages, signed-out redirect, export and cron routes refusing anonymous calls). Add `--cron` with `CRON_SECRET` to also run the cron routes. The signed-in checks are the Playwright tests: `E2E_BASE_URL=https://<staging> npx playwright test` (use a staging project, never production, because the tests create accounts).

## Staging

Use a **separate** Supabase project and a separate Vercel project (or a Vercel preview with its own environment variables) for staging, deployed from a branch other than `main`. Never point staging at production data. Then: deploy, run `npm run smoke -- https://<staging>`, run the Playwright suite against it, and only then promote the same commit to production. `.github/workflows/ci.yml` runs the same checks on every pull request against a local Supabase.

## Speed and quality checks

The reference deployment was measured with Lighthouse (mobile, on production, signed in) after the interface and speed work:

| Measure | Result |
|---|---|
| Accessibility, Best Practices, SEO | 100 on every page measured (12 signed-in pages, plus Login, Privacy and Terms) |
| Performance | 93–99 on 11 of 12 signed-in pages; Login 100, Privacy and Terms 97 |
| Settings performance | 82 in the lab only: its heading paints early, which puts the page's one startup task inside the measured window. A throttled real browser runs the same two short tasks as every other page. |
| First-load JavaScript (uncompressed) | Login 520 KB, Analytics 528 KB, Overview 536 KB, Applications 542 KB, Settings 552 KB, Discover 556 KB, Jobs 560 KB, Candidates 563 KB (`.next/diagnostics/route-bundle-stats.json` after a build) |
| Unused JavaScript | About 20–28 KB per page, which is Next's own polyfill block |

To repeat it:

1. Signed out: `npx lighthouse https://<your-app>.vercel.app/login --form-factor=mobile --only-categories=performance,accessibility,best-practices,seo`.
2. Signed in: Lighthouse has no login, so send your session cookie. Sign in, copy the cookie whose name starts with `sb-` and ends with `-auth-token` (two cookies, `.0` and `.1`, when it is long) from your browser's developer tools, put them in a JSON file as `{"Cookie":"<name>.0=<value>; <name>.1=<value>"}`, and pass it with `--extra-headers=./headers.json`. Treat that file like a password, delete it afterwards and sign out to revoke the session.
3. Expect run-to-run differences of a few points. Repeat a page three times before reading anything into a change.

Quality gates that run on every change (see the README and `.github/workflows/ci.yml`): type-check, lint, unit tests, pgTAP, Playwright on desktop and a phone (including an axe accessibility scan), `npm run check:bundle`, and `npm run check:budget`.

**Route budget.** `npm run check:budget` (after a build) fails if any route's first-load JavaScript grew more than 5% (and 8 KB) over `scripts/route-budgets.json`. If you add JavaScript on purpose, run `npm run check:budget -- --update` in the same commit and say why. The table above is from the original measurement; the budget file is the current truth.

## Backups and restore

- **Database**: which backups Supabase keeps, and whether you can restore them yourself, depends on your plan. Check **Database → Backups** in the dashboard and Supabase's current docs; don't rely on this page for it.
- **Your own backup**, whatever the plan: take one on a schedule.

  ```sh
  npx supabase db dump --linked -f backup-schema.sql
  npx supabase db dump --linked --data-only -f backup-data.sql
  ```

  Keep the files somewhere private: they contain every user's data.
- **Stored files** (the `resumes` bucket) are **not** in database backups. Copy them separately, for example with the Storage API or the dashboard, if you need them.
- **Restore**: create a new project, `npx supabase db push`, then load `backup-data.sql` with `psql`, and point Vercel's environment variables at the new project.
- **Rehearsal (local).** `bash scripts/restore-rehearsal.sh` dumps the local database, restores it into a scratch database and compares the row count of every public table. On 2026-10-18 it matched on all 46 tables (about 1,500 users, 5,600 jobs) and the whole backup and restore took **8 seconds**. Gotcha it found: a fresh database needs the `extensions` schema (with `vector`, `pgcrypto`, `pg_trgm`, `uuid-ossp`) before restoring, or the tables that use embeddings are silently skipped. The script does that for you.
- **Status: restore into a hosted scratch project has not been rehearsed yet.** The local rehearsal proves the backup is complete and the procedure works; repeating the steps above once against a scratch Supabase project, and noting the time here, is still open.

## Recovering from a bad deploy

- **Code**: in Vercel → Deployments, promote the previous deployment. Every migration so far only adds tables and columns, so the older code runs against the newer database.
- **Migrations**: they aren't rolled back automatically. Fix forward with a new migration. Never edit a migration that has already been pushed.
- **A destructive migration** (dropping or rewriting columns) needs a backup taken just before it, and a note in the migration saying so.

## Using LinkedIn responsibly

The app never logs in to LinkedIn, scrapes it or sends anything for you. You open each profile and send each invitation yourself.

Jobs follows it too: postings come only from employers' public job-board APIs or text you paste. LinkedIn, Indeed and Glassdoor are never fetched; every posting links to the employer's site for you to apply.

Discover follows the same rule. Every web query excludes linkedin.com, and the page fetcher refuses LinkedIn hosts (including redirects to them). A LinkedIn link that appears in a public source is kept only as a link for you to open. It never infers 2nd or 3rd degree; only you can mark that. Logs from discovery contain ids and counts, never names or imported contacts.

LinkedIn limits how many invitations an account can send and how many personalized notes a free account gets per month. The limits vary by account and change over time, so the app assumes none. Enter the numbers you plan to stay under in **Settings → Daily planning**.

If LinkedIn shows a warning or restriction, press **Pause outreach** in Settings. The queue stops until you resume.

## Google sign-in

The login page has a **Continue with Google** button next to the email link. It needs one-time setup:

1. In Google Cloud Console, create a project (or use one), then **APIs & Services → OAuth consent screen**. Set the app name, your support email and `https://<your-app>.vercel.app` as the home page. Publish it ("In production") so anyone can sign in, not just test users.
2. **Credentials → Create credentials → OAuth client ID → Web application.** Under **Authorized redirect URIs** add `https://<project-ref>.supabase.co/auth/v1/callback`. Copy the Client ID and Client secret.
3. In Supabase, **Authentication → Sign In / Providers → Google**: turn it on and paste the Client ID and secret.
4. Make sure **Site URL** and **Redirect URLs** (§2.3) include your production address, and your custom domain if you add one.

A Google sign-in with the same verified email as an existing account signs into that account (Supabase links them), so current users keep their data. **On your own computer.** `supabase/config.toml` already turns Google on locally and reads the client from `supabase/.env`. Until you add one, **Continue with Google** sends you back to the sign-in page with a message ("Google sign-in isn't available right now") instead of Supabase's raw `Unsupported provider` error. To make it really work locally: create an OAuth client of type *Web application* in Google Cloud Console with the authorised redirect URI `http://127.0.0.1:54321/auth/v1/callback`, copy `supabase/.env.example` to `supabase/.env`, fill in `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`, and restart Supabase (`npx supabase stop`, then `npm run db:start`). The same error on the hosted app means the provider is off in **Authentication → Sign In / Providers → Google**.

## Sharing it for user feedback

Before sending the link to testers:

1. **Cap AI spend.** Set `AI_DAILY_QUOTA` (for example `5`). Unset means every tester's AI use runs on your key with no limit.
2. **Set up SMTP** (step 2.4). Without it, Supabase's built-in email only reaches your own team, so testers can't sign in.
3. **Schedule the crawler** (step 3.1, pg_cron). Vercel Hobby crons run only once a day, so job boards and alerts won't refresh without it.
4. **Check the redirect URLs** in Supabase Auth include your production address.
5. `/robots.txt` allows crawling and points to `/sitemap.xml`, which lists only `/login`, `/privacy` and `/terms`. `/llms.txt` and `/.well-known/ai-catalog.json` describe the public pages for AI crawlers and agents. That is safe for a private app: anyone not signed in, search bots included, is redirected to `/login`, so nothing behind sign-in is ever served to a crawler. Set `APP_URL` so the sitemap and canonical links use your real address.
6. **Set `NEXT_PUBLIC_FEEDBACK_URL`** (a `mailto:` link or a form link) to show a "Send feedback" button in the navigation, and redeploy.
7. Tell testers the AI privacy note: on Gemini's free tier, Google may use what is sent to improve its products.
