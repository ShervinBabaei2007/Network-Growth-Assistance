# Implementation checklist: Career Command Center

The working record for the improvement plan (the plan itself is kept privately and is not in this repository): what's done, the evidence for it, decisions, and blockers. Update it at every phase boundary so interrupted work can resume accurately. Last updated 2026-10-17.

Status words are kept separate on purpose:
- **implemented**: the code exists.
- **verified**: the stated checks passed.
- **release-ready**: no critical gate is open.

## Commits

| Commit | Contents |
|---|---|
| `121de46` | Phases 0–1, as one commit. Several files mixed foundation and tracker changes, so they weren't split. |
| `eea791b` | Step 0: generic deletion test, AI allowance for intros and notes, checklist corrections |
| `142486d` | Phase 2: saved searches, alerts, notifications, SMTP digests |
| `e64822f` | Phase 3: people at a company, referrals, company pages |
| `4fe7e33` | Workday and Careerjet sources, user-defined networking, kept documents |
| `8900ba6` … `9e36896` | Google sign-in, feedback button, Privacy Policy and Terms (British Columbia law) |
| `cb92a98`, `6c5ded1` | Sidebar and top bar stay in view; light and dark themes meet WCAG contrast |
| `f8473c8`, `4b806e5`, `cd6a6dc`, `e3e6090` | First-run welcome, 18-stop tour, checklist, goal-based menu; tour never fails silently |
| `79ab071` | End-to-end tests run with one worker |
| `4e0c398`, `163a197` | Speed (region, duplicate reads), trimmed menu, Lighthouse fixes, SEO and agent files, lazy charts |
| `01e49f2`, `9ed493d`, `490d0f9`, `8abe32a` | shadcn/ui across the app, phone-friendly Jobs filters, on-demand menus and toasts |
| `8e362b9`, `ba03c8d`, `3c2e639`, `228ff2a` | Test fix, Settings hydration, tables as cards on phones, shared Disclosure, unused code removed |
| `46fc4b9` | README rewrite with screenshots (`npm run docs:screenshots`) |

## Scope of the first release

- **Phase 0:** audit and production foundation.
- **Phase 1:** application tracker, theme, density and text size.
- **Phases 2–9:** later releases; each gets its own plan.

## Baseline (2026-10-12, before any change, branch `jobs-and-redesign` at 9423e28)

Environment: Windows 11, local Supabase (CLI 2.120) in Docker Desktop.

| Check | Command | Result |
|---|---|---|
| Types | `npm run typecheck` | pass |
| Lint | `npm run lint` | pass |
| Unit | `npm test` | pass: 55 files, 722 tests |
| DB / RLS (pgTAP) | `npm run test:db` | pass: 9 files, 117 tests |
| Build | `npm run build` | pass (Partial Prerendering on) |
| Client bundle secrets | `npm run check:bundle` | pass: 43 client files |
| E2E | `npx playwright test` | **8 passed, 1 failed** |

The e2e failure was already there before this work started:
- **Test:** `[mobile] mobile.spec.ts › mobile: menu works and pages fit the screen`.
- **Symptom:** after a menu link is tapped, the mobile nav dialog is still visible.

Local data note: the local database holds the owner's own data. **Never run `db:reset` against it.** Apply new migrations with `npx supabase migration up --local`.

## Capability audit

| Area | Status | Evidence |
|---|---|---|
| Auth (magic link, session refresh in `src/proxy.ts`) | working | signed-out e2e test; `getClaims()` in `actionContext` / `routeUser` |
| RLS on every table, owner policies, composite FKs | working | `supabase/tests/rls_and_constraints.test.sql` and others |
| Client-supplied user ids | none found | audit of actions and routes |
| Service-role use | working, documented | `src/lib/supabase/admin.ts` callers listed in the audit |
| Cron auth (timing-safe `CRON_SECRET`) | working | `src/lib/server/cron-auth.ts` |
| SSRF-safe fetching of outside URLs | working | `src/lib/net/safe-fetch.ts` and its tests |
| Export | **partial → fixed in Phase 0** | missing tables and files |
| Account deletion | working; storage listing capped at 1000 → fixed | `account_deletion.test.sql` |
| Rate limits | **partial → fixed in Phase 0** | only employers, discover and AI had caps |
| Saved / applied / dismissed jobs | working (single status) | `job_user_states`, `setJobStatus` |
| Application tracker (stages, timeline, interviews, reminders) | absent → Phase 1 | |
| Theme (light/dark/system), density, text size | absent → Phase 1 | `.dark` tokens existed but nothing applied them |
| i18n, PWA, notifications, command palette | absent (Phases 2, 8, 9) | |

## Phase 0: foundation

| Item | Status | Evidence |
|---|---|---|
| Baseline recorded | done | table above |
| Export: every user-owned table decided, files manifest, schema version | implemented | `src/lib/data/export-inventory.ts`; its test reads the generated DB types |
| Account deletion pages through stored files | implemented | `deleteAccount` in `src/app/(app)/actions.ts` |
| Response-size caps on third-party APIs | implemented, unit-tested | `src/lib/net/read-capped.ts` |
| `safeFetch` overall deadline | implemented, unit-tested | `totalTimeoutMs` / `deadlineMs` |
| Per-user rate limits (`rate_limits`, `hit_rate_limit`) | implemented, pgTAP-tested | `20261022000000_foundation.sql`, `supabase/tests/foundation.test.sql`, `src/lib/server/rate-limit.ts` |
| FK `tailored_documents.resume_id` | implemented, pgTAP-tested | same migration |
| Constant-time embed secret, `AI_DAILY_QUOTA` validated, admin comment | implemented | |
| Structured, redacted logs for cron | implemented, unit-tested | `src/lib/server/log.ts` |
| Deployment, smoke checks, backup / restore, forward recovery docs | written | `docs/DEPLOYMENT.md` |
| DST bug in `localDateTimeToInstant` (times off by an hour on clock-change days; affected candidate-import times) | fixed, unit-tested | `src/lib/dates.ts` |
| Light `--destructive` below 4.5:1 on background and soft red | fixed | `src/app/globals.css` |
| Mobile e2e false failure (toasts also have role dialog) | test fixed to target the menu by name | `e2e/mobile.spec.ts` |

## Phase 1: application tracker and core experience

| Item | Status | Evidence |
|---|---|---|
| `applications` + events, interviews, contacts, reminders, documents | implemented, pgTAP-tested (34 tests) | `20261023000000_application_tracker.sql`, `supabase/tests/application_tracker.test.sql` |
| Lossless backfill from saved/applied jobs, safe to re-run | verified on the local populated DB: 14 → 14, re-run adds 0 | dry run in a rolled-back transaction, then `migration up` |
| Atomic stage change + event, version check (40001), one open attempt per job | implemented, tested | `set_application_stage`, `applications_one_open_idx` |
| Save / I applied / remove keep the tracker in step; dismissed never creates one | implemented | `setJobStatus`, `sync_application_for_job`, `release_application_for_job` |
| Board (keyboard: labelled stage select; phone: one column) and sortable list | implemented, e2e | `src/app/(app)/applications/` |
| Detail: timeline, notes/responses, interviews (+ confirm time change, ICS sequence), reminders, contacts, documents (immutable copy), offered pay | implemented, e2e (main path) | `applications/[id]/` |
| `.ics` export (UTC, stable UID, SEQUENCE, escaping, folding) | unit-tested, e2e download | `src/lib/applications/ics.ts`, `api/applications/[id]/interviews` |
| "Mark as applied?" after a verified Apply link (never inferred) | implemented, e2e | `src/components/jobs/apply-link.tsx` |
| "No response" suggestion (never automatic, days in Settings) | implemented, unit-tested | `src/lib/applications/no-response.ts` |
| Overview: due reminders and the week's interviews | implemented, e2e | `src/components/applications/job-search-summary.tsx` |
| Theme System/Light/Dark, density, text size; pre-paint; reduced motion | implemented, unit-tested, checked in a browser | `src/lib/appearance.ts`, `src/components/appearance-sync.tsx`, `globals.css` |
| Contrast of token pairs, both themes | verified ≥ 4.5:1 (computed from tokens) | 18 pairs per theme |
| Export / deletion cover the new tables | implemented, tested | Export: inventory test. Deletion: since Step 0 of Phases 2–4, `account_deletion.test.sql` checks that every `user_id` table cascades and that a seeded account leaves no rows. (Before that, interviews, reminders, documents and `rate_limits` weren't checked: corrected.) |

## Verification run (2026-10-12, end of Phases 0–1, local)

| Check | Result |
|---|---|
| `npm run typecheck` | pass |
| `npm run lint` | pass |
| `npm test` | pass: 60 files, 759 tests |
| `npm run test:db` | pass: 11 files, 161 tests |
| `npm run build` | pass (new routes keep Partial Prerendering) |
| `npm run check:bundle` | pass: 46 client files |
| `npx playwright test` | pass: 11/11, desktop + mobile |

**Browser review.** 20 Playwright screenshots of board, list, detail, Overview and Settings, in light and dark, at 1366px and 390px, were inspected.
- Horizontal page overflow was 0 in all of them.
- The phone list view scrolls sideways inside its own frame.
- Outline buttons in the light theme have a faint border. This is the existing style, not changed here.

**Not done:**
- Automated axe accessibility scan (`@axe-core/playwright` isn't installed). Keyboard paths were covered only by e2e (labelled selects, focus).
- A manual screen-reader pass.

## Phase 2: saved searches, alerts, notifications

| Item | Status | Evidence |
|---|---|---|
| Jobs feed extracted into a shared service: same search + same moment → same jobs for the page and alerts; alerts never call outside sources | implemented, unit-tested; page unchanged (e2e) | `src/lib/job-postings/feed-query.ts`, `feed-service.ts`, `feed-service.test.ts` |
| `saved_searches`, `saved_search_matches`, `notifications`, `email_deliveries` (owner RLS, server-only writes where needed, 20-search cap) | implemented, pgTAP-tested (22) | `20261024000000_alerts_notifications.sql`, `supabase/tests/alerts.test.sql` |
| Baseline on save: what a search shows now is never announced | implemented, e2e | `establishBaseline` in `src/lib/alerts/run.ts` |
| New = no copy of the job (any source) seen before; durable per-job history | implemented, e2e | `feedGroups`, `runSearch` |
| Overlapping runs: lease with `skip locked`; rerun announces nothing twice; failed run retried, pending matches kept | implemented, pgTAP + e2e | `claim_due_saved_searches`, `deliver_alert` |
| Daily/weekly at the user's local hour, DST-correct | implemented, unit-tested | `src/lib/alerts/schedule.ts` |
| Reminders, interviews (24 h, re-announced if moved), Monday summary, broken boards you added (once per outage) | implemented; reminders/interviews unit paths covered by pgTAP `notify_user`; not e2e | `run.ts` |
| Notification centre, header bell with unread count, mark read / all read (Undo) | implemented, e2e | `/notifications`, `src/components/alerts/notification-bell.tsx` |
| Saved searches page: open, edit, delete (Undo) | implemented; checked in screenshots | `/jobs/searches` |
| Email digests over SMTP: opt-in twice (global + per search), no tracking, one-click unsubscribe, retries, at-least-once | implemented, unit + e2e (Mailpit) | `src/lib/email/`, `/api/email/unsubscribe` |
| No SMTP → no email option, in-app alerts still work | verified (dev server without SMTP, cron run) | screenshot run log |
| Export / deletion cover the new tables | done | inventory test; generic deletion test |
| Retention: read notifications 90 days, sent emails 30 days | implemented | `prune_notifications` in the daily cron |

**Verification (2026-10-12, local):**

| Check | Result |
|---|---|
| typecheck, lint, build, `check:bundle` (47 files) | all pass |
| Unit tests | 784 pass |
| pgTAP | 185 pass |
| E2E | 13/13 |

**Browser review.** Screens checked in light and dark, desktop and phone, with no horizontal overflow: save form, saved searches, notifications, Settings → Notifications.

**Found and fixed during this phase:**
- **`localDateTimeToInstant` with times skipped by the spring change.** They resolved to before the gap, not after it, and the Phase 0 comment was wrong. Now they move forward, which is the standard behaviour. Tested.
- **Alert emails queued during a cron run waited for the next run.** The due check used the run's start time.
- **E2E specs run in parallel workers**, which the earlier "one at a time" note got wrong. The alerts spec now uses a title no other spec searches for, and two specs wait for the Jobs page before their fixture check.

**Not verified:** a real SMTP provider (deliverability, SPF/DKIM, limits). Your configuration; see `docs/DEPLOYMENT.md` §3c.

## Phase 3: network ↔ jobs bridge

| Item | Status | Evidence |
|---|---|---|
| One company matcher for the bridge: exact (after legal suffixes) counts; regional names, brand groups and name prefixes are only *possible* | implemented, unit-tested | `src/lib/companies/match.ts`, `match.test.ts` |
| User-scoped, correctable "same / different company" decisions (Undo) | implemented, pgTAP + e2e | `company_aliases`, `decideCompanies` |
| People at {company}: imported connections and saved People, each with the reason it matched and evidence age; over 180 days flagged "may have changed jobs since" | implemented, e2e | `src/lib/companies/people.ts`, `src/components/companies/people-at-company.tsx` |
| Referrals ("I asked" / "They referred me"): on the person, as the application's referrer, once on its timeline; Undo | implemented, pgTAP + e2e | `record_referral`, `undo_referral` in `20261025000000_network_bridge.sql` |
| Referral-ask drafts: template without AI; optional AI rewrite charged to the allowance; its own guard (no "works there now", no invented facts, numbers or links, no implied meeting without recorded contact); copied, never sent | implemented, unit + e2e (template) | `src/lib/discovery/referral.ts` |
| Company page: applications (all attempts), verified open jobs, referrals, people | implemented, e2e | `/companies/[slug]` |
| Links: job page and application header → company page | implemented | |

**Decisions:**
- `normCompany` (dedupe keys) and discovery's `sameCompany` are unchanged. The new matcher is used by the bridge only.
- Brand groups (Amazon / AWS, Meta / Facebook) are *possible*, never automatic: a group's people may work in a different unit.
- Imported connections can't carry a referral until they're saved to People, since referrals need a person record.

**Verification (local):**

| Check | Result |
|---|---|
| typecheck, lint, build, `check:bundle` (49 files) | all pass |
| Unit tests | 795 pass |
| pgTAP | 197 pass |
| E2E | 14/14 (new `network.spec.ts`) |

**Browser review.** Job page "People at" card and company page, in light and dark, desktop and phone, with no horizontal overflow.

## Batch after Phase 3 (2026-10-17): Workday, Careerjet, user-defined networking

| Item | Status | Evidence |
|---|---|---|
| Workday career sites as a job source; Careerjet search (optional key) | implemented, tested | `src/lib/job-postings/ats/workday*.ts`, `providers/careerjet*.ts`, `20261027000000_workday_and_careerjet.sql`, `workday_and_careerjet.test.sql` |
| Tailored documents kept when their job is pruned | implemented, pgTAP-tested | `20261026000000_keep_documents_on_prune.sql`, `prune_keeps_documents.test.sql` |
| Schools, disciplines, targets and the connection goal are the user's own; nothing built in; default time zone UTC; existing users keep their data as ordinary rows | implemented, pgTAP-tested | `20261028000000_user_defined_networking.sql`, `user_defined_networking.test.sql`, `src/lib/data/catalog.ts` |
| `AI_DAILY_QUOTA` unset = no limit; crawl cadence 5 minutes | implemented, documented | `docs/DEPLOYMENT.md` |

**Test fixes:** `alerts.test.sql` claimed at most 10 due searches, so it failed on a database holding more than 10 real overdue searches; it now claims up to 10000. The applications e2e expected a Vancouver default time zone; the default is now UTC.

**Verification (2026-10-17, local):** typecheck, lint, build and `check:bundle` (49 files) pass; unit tests 787 pass; pgTAP 217 pass (16 files); generated DB types match; e2e 14/14.

Still open at that date: restore rehearsal, staging smoke checks, performance budget, accessibility scan. Improvement-plan phases 4 onward are not started. Later work is recorded in the next section.

## Since then (2026-10-17): onboarding, speed, search visibility, shadcn/ui, phones

| Item | Status | Evidence |
|---|---|---|
| First-run welcome (goal, optional job preferences, first action), **18-stop tour**, derived Getting-started checklist; stored in `settings.onboarding`; reopen from Help or Settings | implemented, unit + e2e | `20261029000000_onboarding.sql`, `src/lib/onboarding/`, `src/components/onboarding/`, `e2e/onboarding.spec.ts` |
| Tour and welcome never fail silently: an unreadable state (deploy ahead of its migration) falls back to a fresh state, saves nothing and logs why | implemented, tested | `src/lib/onboarding/read.ts`; production hit this once (migration not applied) and was fixed with `supabase db push` |
| Goal-based menu: what matches the goal is always shown, the rest under **More**; Settings and Help pinned | implemented, e2e | `src/components/app-nav.tsx` (`NAV_ITEMS`, `splitNav`), `e2e/nav.spec.ts` |
| Speed: functions pinned next to the database (`vercel.json`, `pdx1`), one shared settings read per request, Jobs stale-while-revalidate, single Suspense boundary on Settings (no layout shift) | implemented, measured | Lighthouse, below |
| Search visibility: crawling allowed everywhere, sitemap of the three public pages, `llms.txt`, `/.well-known/ai-catalog.json`, canonical links, descriptive link names | implemented, measured | `src/app/robots.ts`, `sitemap.ts`, `src/lib/site.ts`, `public/`, `src/proxy.ts` public paths |
| JavaScript diet: Zod kept out of the browser (client-safe `steps.ts` vs server `state.ts`), Recharts loaded when a chart nears the screen, welcome and tour loaded on demand, then the job menu, phone menu panel, desktop dropdown and toast interface loaded on first use | implemented | `route-bundle-stats.json`: Overview 621 to 536 KB, Jobs 733 to 560 KB, Analytics 614 to 527 KB, Login 559 to 520 KB first load |
| **shadcn/ui everywhere**: Select (desktop) and Native Select (phones and first paint) behind one `AppSelect`, Checkbox, Alert, Empty, Skeleton, Dropdown Menu, Breadcrumb, Pagination, Field, Card tiles, Sheet and a shared `Disclosure`; nine unused components removed | implemented, unit + e2e | `src/components/app-select.tsx`, `src/components/ui/`, `src/lib/ui/select-options.ts` (+ test) |
| Phone work: no content cut off at 360 px on 19 pages, bigger touch targets, 16 px inputs, bottom-sheet welcome, safe-area padding, Jobs filters behind **Filters (n)**, **tables become cards** on People, Candidates, Connections and Employers | implemented, e2e | `e2e/mobile.spec.ts` (cut-off check and card layout), `src/components/ui/table.tsx` (`stack`) |
| README with screenshots generated from the app, and this folder brought up to date | done | `e2e/readme-screenshots.spec.ts`, `playwright.readme.config.ts`, `docs/images/` |

**Measured on production (Lighthouse, mobile, 2026-10-17):**

| Measure | Result |
|---|---|
| Accessibility, Best Practices, SEO | 100 on every page measured |
| Performance, signed in (12 pages) | 93-99 on 11 pages; Settings 82 |
| Performance, signed out | Login 100, Privacy 97, Terms 97 |

Settings 82: its heading paints early, which puts the page's one startup task inside Lighthouse's measured window. A throttled real browser (4x CPU) shows the same two long tasks, about 57 ms and 134 ms, on Settings, Candidates and Overview. Lazy time-zone suggestions and lazy row-edit forms were added for it and trimmed the lab score a little locally, but did not change the production number; the diagnosis was revised accordingly.

**Verification (2026-10-17, local):**

| Check | Result |
|---|---|
| `npm run typecheck`, `npm run lint` | pass |
| `npm test` | pass: 894 tests |
| `npm run test:db` | pass: 222 tests (17 files) |
| `npm run build` | pass |
| `npm run check:bundle` | pass: 76 client files |
| `npx playwright test` | pass: 44 (desktop and phone) |

**Found and fixed along the way:**
- Content cut off on a phone on Settings, Candidates and Resume; the Applications board's stage selects were clipped.
- A layout shift of 0.34 on Settings when the AI-key card streamed in under a skeleton.
- Next's dev-only "N" badge covered the bottom-left controls on a phone (turned off with `devIndicators: false`).
- Checkbox labels: tests now use role queries because the shadcn Checkbox is not a plain input.
- The analytics chart test could hit the placeholder while it was being swapped for the chart; it now retries.

**Not done, by choice:** shadcn Tooltips (they need hover and would add JavaScript; icon-only controls have an aria-label and a native `title` instead), shadcn Progress under `ProgressMeter` (its "pending never counts" two-segment rule isn't supported), Sonner (the lazy custom toast is tested and accessible), and tables as cards on Applications (its sortable column headers are the only way to sort there).

## Fixes outside the roadmap

| Item | Status | Evidence |
|---|---|---|
| Intro and connection-note AI rewrites used the server key without charging the daily allowance | fixed: both now use `getUserLLM` (own key, or server key after `charge()`) | `src/lib/ai/index.ts`, `src/lib/ai/user-llm.test.ts` |

## Polish items (§6 of the improvement plan)

| Item | Target phase | Status |
|---|---|---|
| Command palette; j/k/s/o/d/? shortcuts | 7 (settings and onboarding) | not started |
| Remember searches/filters per track; 25/50/100 per page; mobile filter summary | 2 (saved searches) and 5 (tracks) | mobile filter button with a count done; the rest not started |
| Compare 2–3 jobs | 3 (company view) | not started |
| Hide companies or title patterns, with Undo; duplicate-paste warning | 2 | not started |
| Copy a job summary; CSV export of saved/applied jobs; preferred external search links | 2 | external search links exist; the rest not started |
| `.ics` for calendar events | 1 | done |
| Optional Gemini employer search (after re-checking its terms) | 3 | not started |
| Bulk tags/status in Candidates and People; weekly goal progress; snooze a person | 3 | not started |
| Empty states, retryable errors, relative + absolute times, What's New | every phase | empty states and retryable load errors done (shadcn Empty and Alert); What's New not started |
| Visual regression and automated accessibility checks; retention of old notifications | 2 (retention), later (visual / axe) | retention done; accessibility measured with Lighthouse (100), but no axe in the test run and no visual regression |

## Decisions

1. **Rate limits run in Postgres** (fixed windows, `auth.uid()` inside a security-definer function). They work across serverless instances with no new infrastructure. The check fails closed: if it errors, the action is refused.
2. **Export** stays a single JSON file. Uploaded resume files are listed with their authenticated download links rather than embedded.
3. **Application identity.** One user-owned row per attempt.
   - It keeps a copy of the posting, and its `job_id` becomes null if the job is pruned.
   - At most one open attempt per job.
   - A new attempt is only started with **Apply again**.
   - `job_user_states` still drives the Jobs feed (saved, applied, dismissed).
4. **Who may write what.** Stage, version and stage events are written only by security-definer functions, which check `auth.uid()`. Users have column-level UPDATE only on notes, pay and applied date. The timeline is append-only, except that users can delete notes and responses they added.
5. **Appearance.** Settings are the source of truth, mirrored to a cookie that an inline `<head>` script reads before paint. The root layout doesn't call `cookies()`, which under Cache Components would block every route (per the Next 16 docs, "preventing flash before hydration").
6. **Calendar times are written in UTC**, which is valid in every calendar app. The zone the user scheduled in is noted in the description, so no VTIMEZONE blocks are needed.
7. **The ICS route is `/api/applications/[id]/interviews`**, not `…/interviews.ics`. The file name the user downloads still ends in `.ics`.

## Blockers and unverified gates

- Backup restore has not been exercised (no production or staging access from this environment): **unverified**.
- Staging deploy and smoke checks (`docs/DEPLOYMENT.md`, "Smoke checks after each deploy"): **unverified**.
- Performance: **now measured** (Lighthouse above, first-load JavaScript per route). Still missing: the proposed server-time budget for tracker pages with 500 applications, which needs a seeded dataset and a staging deploy.
- Accessibility: Lighthouse scores 100, contrast is unit-tested and an **axe scan now runs in the end-to-end tests** (`e2e/a11y.spec.ts`, see `docs/ACCESSIBILITY.md`). There is still **no manual screen-reader pass**; the checklist for it is in that file.
- A real SMTP provider (deliverability, SPF/DKIM, limits) is your configuration and is **unverified**.
- **Release gates, 2026-10-18:** a CI workflow, per-route JavaScript budget (`npm run check:budget`), smoke script (`npm run smoke`) and a local backup-and-restore rehearsal (`scripts/restore-rehearsal.sh`, 46 tables matched, 8 seconds) are in place. **Still open:** a real staging deployment (needs a second Supabase and Vercel project), the smoke checks run against it, and a restore into a hosted scratch project. The CI workflow has not yet run on GitHub.
- **Release status:** everything built so far is **implemented and verified locally**, and the signed-out and signed-in pages are measured on production. It is **not release-ready for a wide launch** until the restore rehearsal, staging smoke checks, a screen-reader pass and legal review of the Privacy Policy and Terms are done.

## Next

1. Rehearse a restore in a scratch project and record it in `docs/DEPLOYMENT.md`.
2. Add a staging deployment and run the smoke checks there.
3. Add an automated accessibility scan (`@axe-core/playwright`) to the end-to-end run, and a screen-reader pass.
4. Improvement-plan phases 4 onward, starting with the polish items above (command palette and shortcuts, compare jobs, bulk actions).
