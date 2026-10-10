# Deploying the Network Growth Assistant

The app runs on **Vercel** (web app and daily cron) and **Supabase** (Postgres and email sign-in). Both have free tiers that cover one person's use. The whole setup takes about 20 minutes.

## What you need

- A GitHub account. The code should be in a **private** repository.
- A Vercel account, connected to GitHub.
- A Supabase account.
- Optional: an Anthropic API key, for the "Suggest with Claude" button on connection notes.

## 1. Push the code to GitHub

```sh
gh repo create linkedin-network-growth --private --source . --push
```

Or create an empty private repository on github.com and push to it.

## 2. Create the Supabase project

1. In the Supabase dashboard, create a project. Pick the **Canada (Central)** region, which is closest to Vancouver and Toronto.
2. Link this repository to it, then apply every migration:

   ```sh
   npx supabase login
   npx supabase link --project-ref <your-project-ref>
   npx supabase db push
   ```

   `db push` creates the tables, row-level security policies, functions and the signup trigger from `supabase/migrations/`.
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
   | `ANTHROPIC_API_KEY` | Optional. Leave unset to keep Claude suggestions off. |

3. Deploy.

Vercel reads `vercel.json` and registers the daily job (`/api/cron/daily`, scheduled for 12:00 UTC, which is early morning in Canada). Vercel automatically sends `Authorization: Bearer $CRON_SECRET` with each cron call, and the route rejects calls without it.

## 4. Check that it works

1. Open the site and sign in with your email. The link arrives from Supabase.
2. On **Overview**, enter your starting connection count.
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
- **Anthropic (optional)**
  - Pay-as-you-go. A note rewrite is a few hundred tokens on `claude-opus-5-5` at low effort, roughly a third of a cent each.
  - The app caps rewrites at 25 per user per day.

Running costs are $0 apart from optional Claude rewrites.

## Operating it

- **Logs**: Vercel → Project → Logs. Server errors are prefixed `[cron]`, `[queue]` or `[analytics]`. They contain error messages only, never names or profile data.
- **Daily job failures**: they appear in **Settings → Daily job** with the error. The next cron call retries a failed day automatically, and **Run now** retries it immediately.
- **Rotating secrets**: change `CRON_SECRET` or `SUPABASE_SECRET_KEY` in Vercel and redeploy. Rotate the Supabase key in its dashboard first.
- **Schema changes**: add a migration under `supabase/migrations/`, test it locally (`npm run db:reset && npm run test:db`), then `npx supabase db push`.
- **Deleting data**: each user can delete individual candidates, or their whole account under **Settings → Your data**. Account deletion cascades to every table.

## Using LinkedIn responsibly

The app never logs in to LinkedIn, scrapes it or sends anything for you. You open each profile and send each invitation yourself.

LinkedIn limits how many invitations an account can send and how many personalized notes a free account gets per month. The limits vary by account and change over time, so the app assumes none. Enter the numbers you plan to stay under in **Settings → Daily planning**.

If LinkedIn shows a warning or restriction, press **Pause outreach** in Settings. The queue stops until you resume.
