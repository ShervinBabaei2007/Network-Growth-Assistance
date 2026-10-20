# Security policy

Thank you for helping keep Network Growth Assistant and its users safe.

## Supported versions

This project has no numbered releases. Only the current `main` branch and the live deployment are supported; fixes land there.

| Version | Supported |
| --- | --- |
| `main` and the live site | Yes |
| Anything else (old commits, forks) | No |

## Reporting a vulnerability

**Please do not open a public issue for a security problem.**

1. Preferred: use GitHub's private reporting. Open the repository's **Security** tab, choose **Report a vulnerability**, and describe the problem.
2. Alternative: email <shervinb22@gmail.com> with the subject "Security: Network Growth Assistant".

Please include:

- what you found and why it matters (what an attacker could read or change);
- the steps to reproduce it, and the route or file involved if you know it;
- your browser or setup, if it matters.

Do not include real personal data from anyone else's account.

## What to expect

This is maintained by one person, so these are best-effort targets, not guarantees:

- an acknowledgement within 5 business days;
- a status update within 14 days;
- a fix as soon as practical, with the most serious problems first.

There is no bug bounty. If you would like credit once the fix is public, say so in your report.

## Scope

In scope:

- sign-in, sessions and account deletion;
- reading or changing another person's data (row-level security bypass, broken access checks);
- server-side request forgery or unsafe fetching in Discover and Jobs;
- cross-site scripting, injection, and open redirects;
- the cron and other API routes under `src/app/api`, including their authentication;
- exposed secrets or keys, including stored AI keys;
- file upload and import handling (CSV, resume, LinkedIn export).

Out of scope:

- attacks that need a device or account the attacker already controls;
- social engineering, phishing, and physical attacks;
- denial of service and load or rate testing;
- a missing header or setting with no demonstrated impact;
- automated scanner output with no working proof of concept;
- problems in third-party services (Supabase, Vercel, Google, the AI providers, job boards). Please report those to the provider.

## Testing rules

- Test only against your own account, or a local copy (`npm run db:start`). Never touch other people's data.
- Stop as soon as you have shown the problem. Do not keep, copy or share any data you reach.
- Do not run automated high-volume tests against the live site.

Research done in good faith within these rules will not be pursued.

## How the app protects data

This describes the current design. It is not a guarantee.

- Every row of user data is protected by Supabase row-level security. The server-only `SUPABASE_SECRET_KEY` is used only by the daily job and account deletion.
- `/api/cron/daily` requires the `CRON_SECRET` bearer token.
- Fetches of public pages go through a guarded fetcher with size caps (`src/lib/net/safe-fetch.ts`, `src/lib/net/read-capped.ts`). Post-sign-in redirects are checked (`src/lib/auth/safe-next-path.ts`).
- Keys that users store for AI features are encrypted with `APP_ENCRYPTION_KEY`. Email unsubscribe links are signed with `EMAIL_TOKEN_SECRET`.
- Responses send `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, a strict referrer policy, a restrictive permissions policy and HSTS (`next.config.ts`).
- The app never scrapes LinkedIn, never asks for or stores a LinkedIn password or cookies, and sends no data to analytics companies.

Known gap: there is no Content-Security-Policy header yet.

## Leaked secrets

If you find a key, token or password in the repository, its history, or a public page, report it privately as above rather than using it. `.env.local` is git-ignored and must never be committed.

## Related

- [Privacy and data](README.md#privacy-and-data)
- [Privacy Policy](src/app/privacy/page.tsx)
