import "server-only";
import { localDate, weekStart } from "@/lib/dates";
import { renderDigest } from "@/lib/email/digest";
import { emailConfig, getMailer } from "@/lib/email/mailer";
import { unsubscribeToken } from "@/lib/email/unsubscribe";
import { FeedQuery } from "@/lib/job-postings/feed-query";
import { loadFeed, type Feed } from "@/lib/job-postings/feed-service";
import { chunk, type Db } from "@/lib/job-postings/service";
import { errorMessage, log } from "@/lib/server/log";
import { nextRunAt, runKey, type AlertFrequency } from "./schedule";

/**
 * Saved-search alerts and the other notifications, run by /api/cron/alerts. Reads stored
 * jobs only (never asks outside job sources), and every step can run again safely: matches
 * are keyed by job, notifications by what they're about, emails by notification.
 */

/** Every job id a feed shows under "All results", with its copies from other sources. */
export function feedGroups(feed: Pick<Feed, "tabs" | "duplicatesOf">): string[][] {
  return feed.tabs.all.map((j) => [j.id, ...(feed.duplicatesOf.get(j.id) ?? []).map((d) => d.id)]);
}

async function knownJobs(db: Db, searchId: string, ids: string[]): Promise<Set<string>> {
  const known = new Set<string>();
  for (const part of chunk(ids, 200)) {
    const { data } = await db.from("saved_search_matches").select("job_id").eq("saved_search_id", searchId).in("job_id", part);
    for (const r of data ?? []) known.add(r.job_id);
  }
  return known;
}

/**
 * Starts (or restarts, after the search changed) counting from now: everything the search
 * shows right now is recorded as already seen, so the first alert brings only new jobs.
 */
export async function establishBaseline(db: Db, userId: string, searchId: string, query: FeedQuery, now = Date.now()): Promise<{ ok: true; count: number } | { ok: false }> {
  const feed = await loadFeed(db, userId, query, { now, refresh: false });
  if ("error" in feed) return { ok: false };
  await db.from("saved_search_matches").delete().eq("saved_search_id", searchId);
  const ids = [...new Set(feedGroups(feed).flat())];
  for (const part of chunk(ids, 500)) {
    const { error } = await db.from("saved_search_matches").insert(part.map((job_id) => ({ saved_search_id: searchId, job_id, user_id: userId, status: "baseline" })));
    if (error) return { ok: false };
  }
  return { ok: true, count: ids.length };
}

type SavedSearchRow = { id: string; user_id: string; name: string; query: unknown; alert_frequency: string; alert_weekday: number; alert_hour: number; next_run_at: string | null };

/** One due search: new jobs become pending matches, then one notification. */
async function runSearch(db: Db, s: SavedSearchRow, now: Date): Promise<{ newJobs: number; notified: boolean }> {
  const query = FeedQuery.safeParse(s.query);
  const { data: settings } = await db.from("settings").select("timezone").eq("user_id", s.user_id).single();
  const tz = settings?.timezone ?? "UTC";
  const next = nextRunAt(s.alert_frequency as AlertFrequency, s.alert_weekday, s.alert_hour, tz, now);
  if (!query.success) {
    await db.from("saved_searches").update({ last_error: "This saved search can't be read. Edit and save it again.", next_run_at: next?.toISOString() ?? null, lease_until: null }).eq("id", s.id);
    return { newJobs: 0, notified: false };
  }
  const feed = await loadFeed(db, s.user_id, query.data, { now: now.getTime(), refresh: false });
  if ("error" in feed) throw new Error(`feed ${feed.error}`);
  const groups = feedGroups(feed);
  const known = await knownJobs(db, s.id, groups.flat());
  // A job is new only if no copy of it (from any source) was seen before.
  const fresh = groups.filter((g) => !g.some((id) => known.has(id)));
  const rows = fresh.flat().map((job_id) => ({ saved_search_id: s.id, job_id, user_id: s.user_id, status: "pending" }));
  for (const part of chunk(rows, 500)) {
    const { error } = await db.from("saved_search_matches").upsert(part, { onConflict: "saved_search_id,job_id", ignoreDuplicates: true });
    if (error) throw new Error(error.message);
  }
  // Delivers this run's pending matches, and any a crashed earlier run left behind.
  const { data: notificationId, error } = await db.rpc("deliver_alert", { p_search: s.id, p_run_key: runKey(s.next_run_at, now), p_label: s.name, p_href: "/notifications" });
  if (error) throw new Error(error.message);
  await db.from("saved_searches").update({ last_run_at: now.toISOString(), last_error: null, next_run_at: next?.toISOString() ?? null, lease_until: null }).eq("id", s.id);
  return { newJobs: fresh.length, notified: Boolean(notificationId) };
}

export async function runDueSearches(db: Db, now: Date, deadline: number) {
  const out = { searches: 0, newJobs: 0, notifications: 0, failed: 0 };
  while (Date.now() < deadline) {
    const { data: due, error } = await db.rpc("claim_due_saved_searches", { p_limit: 5, p_lease_seconds: 300 });
    if (error) throw new Error(error.message);
    if (!due?.length) break;
    for (const s of due) {
      out.searches++;
      try {
        const r = await runSearch(db, s, now);
        out.newJobs += r.newJobs;
        if (r.notified) out.notifications++;
      } catch (e) {
        out.failed++;
        log("error", "cron.alerts", "search_failed", { search: s.id, message: errorMessage(e) });
        // Try again on the next call (the lease is released); matches already found stay pending.
        await db.from("saved_searches").update({ last_error: "Couldn't check this search. It will be tried again.", lease_until: null }).eq("id", s.id);
      }
      if (Date.now() >= deadline) break;
    }
  }
  return out;
}

// ------------------------------------------------------------------ other notifications

async function wants(db: Db, column: "notify_reminders" | "notify_interviews", userIds: string[]): Promise<Set<string>> {
  const yes = new Set<string>();
  for (const part of chunk([...new Set(userIds)], 200)) {
    const { data } = await db.from("settings").select(`user_id, ${column}`).in("user_id", part);
    for (const r of (data ?? []) as Record<string, unknown>[]) if (r[column]) yes.add(r.user_id as string);
  }
  return yes;
}

/** Reminders that are due, once each. */
export async function notifyDueReminders(db: Db, now: Date): Promise<number> {
  const { data } = await db
    .from("application_reminders")
    .select("id, user_id, application_id, text, due_at, applications(title, company)")
    .is("done_at", null)
    .lte("due_at", now.toISOString())
    .order("due_at")
    .limit(500);
  const rows = data ?? [];
  const allowed = await wants(db, "notify_reminders", rows.map((r) => r.user_id));
  let made = 0;
  for (const r of rows) {
    if (!allowed.has(r.user_id)) continue;
    const where = [r.applications?.title, r.applications?.company].filter(Boolean).join(" · ");
    const { data: id } = await db.rpc("notify_user", { p_user: r.user_id, p_kind: "reminder", p_title: r.text, p_body: where, p_href: `/applications/${r.application_id}`, p_dedupe: `reminder:${r.id}` });
    if (id) made++;
  }
  return made;
}

/** Interviews in the next 24 hours; a moved interview is announced again. */
export async function notifyUpcomingInterviews(db: Db, now: Date): Promise<number> {
  const { data } = await db
    .from("application_interviews")
    .select("id, user_id, application_id, starts_at, kind, ics_sequence, applications(title, company)")
    .gte("starts_at", now.toISOString())
    .lte("starts_at", new Date(now.getTime() + 86_400_000).toISOString())
    .limit(500);
  const rows = data ?? [];
  const allowed = await wants(db, "notify_interviews", rows.map((r) => r.user_id));
  let made = 0;
  for (const r of rows) {
    if (!allowed.has(r.user_id)) continue;
    const what = [r.applications?.title, r.applications?.company].filter(Boolean).join(" at ");
    const { data: id } = await db.rpc("notify_user", {
      p_user: r.user_id,
      p_kind: "interview",
      p_title: `Interview within 24 hours${what ? `: ${what}` : ""}`,
      p_body: "",
      p_href: `/applications/${r.application_id}`,
      p_dedupe: `interview:${r.id}:${r.ics_sequence}`,
      p_data: { starts_at: r.starts_at },
    });
    if (id) made++;
  }
  return made;
}

/** Monday from 8 a.m. local time, for users who asked for it: last week in numbers. */
export async function notifyWeeklySummaries(db: Db, now: Date): Promise<number> {
  let made = 0;
  for (let from = 0; ; from += 500) {
    const { data: users } = await db.from("settings").select("user_id, timezone").eq("weekly_summary", true).order("user_id").range(from, from + 499);
    for (const u of users ?? []) {
      const today = localDate(now, u.timezone);
      const hour = Number(new Intl.DateTimeFormat("en-US", { timeZone: u.timezone, hour: "numeric", hourCycle: "h23" }).format(now));
      if (weekStart(today) !== today || hour < 8) continue;
      const since = new Date(now.getTime() - 7 * 86_400_000).toISOString();
      const soon = new Date(now.getTime() + 7 * 86_400_000).toISOString();
      const [added, moved, interviews, reminders] = await Promise.all([
        db.from("applications").select("id", { count: "exact", head: true }).eq("user_id", u.user_id).gte("created_at", since),
        db.from("application_events").select("id", { count: "exact", head: true }).eq("user_id", u.user_id).in("kind", ["stage", "reopened"]).gte("occurred_at", since),
        db.from("application_interviews").select("id", { count: "exact", head: true }).eq("user_id", u.user_id).gte("starts_at", now.toISOString()).lte("starts_at", soon),
        db.from("application_reminders").select("id", { count: "exact", head: true }).eq("user_id", u.user_id).is("done_at", null).lte("due_at", soon),
      ]);
      const n = (x: { count: number | null }) => x.count ?? 0;
      const body = `Last 7 days: ${n(added)} application${n(added) === 1 ? "" : "s"} added, ${n(moved)} stage change${n(moved) === 1 ? "" : "s"}. Coming up: ${n(interviews)} interview${n(interviews) === 1 ? "" : "s"}, ${n(reminders)} reminder${n(reminders) === 1 ? "" : "s"} due.`;
      const { data: id } = await db.rpc("notify_user", { p_user: u.user_id, p_kind: "weekly_summary", p_title: "Your week in your job search", p_body: body, p_href: "/applications", p_dedupe: `weekly:${today}` });
      if (id) made++;
    }
    if ((users ?? []).length < 500) return made;
  }
}

/** An employer board someone added stops working: tell them once per outage. */
export async function notifySourceProblems(db: Db): Promise<number> {
  const { data } = await db.from("employers").select("id, name, added_by, last_crawled_at, last_error").eq("status", "failing").not("added_by", "is", null).limit(500);
  let made = 0;
  for (const e of data ?? []) {
    // last_crawled_at only moves on success, so it names this outage.
    const { data: id } = await db.rpc("notify_user", {
      p_user: e.added_by!,
      p_kind: "source_problem",
      p_title: `${e.name}'s job board isn't working right now`,
      p_body: "Its jobs may be missing from your results until it's back. Nothing else is affected; it's checked again automatically.",
      p_href: "/jobs/employers",
      p_dedupe: `source:${e.id}:${e.last_crawled_at ?? "never"}`,
    });
    if (id) made++;
  }
  return made;
}

// ------------------------------------------------------------------ email

const BACKOFF_MIN = [15, 60, 360];

/** Sends queued alert emails. At least once: a crash after sending can repeat one email. */
export async function sendQueuedEmails(db: Db, now: Date, limit = 20) {
  const out = { sent: 0, failed: 0, skipped: 0 };
  const { data: queue } = await db
    .from("email_deliveries")
    .select("id, user_id, attempts, notification_id, notifications(data)")
    .eq("status", "pending")
    // The current time, not the run's start: emails queued earlier in this run go out now.
    .lte("next_attempt_at", new Date().toISOString())
    .order("next_attempt_at")
    .limit(limit);
  if (!queue?.length) return out;
  const mailer = getMailer();
  const config = emailConfig();
  for (const d of queue) {
    const skip = async (reason: string) => {
      await db.from("email_deliveries").update({ status: "skipped", last_error: reason }).eq("id", d.id);
      out.skipped++;
    };
    if (!mailer.enabled || !config) {
      await skip(mailer.enabled ? "Email isn't set up on this server." : mailer.reason);
      continue;
    }
    // The user may have turned email off since it was queued.
    const searchId = ((d.notifications?.data ?? {}) as { saved_search_id?: string }).saved_search_id ?? null;
    const [{ data: settings }, { data: search }] = await Promise.all([
      db.from("settings").select("email_notifications").eq("user_id", d.user_id).single(),
      searchId ? db.from("saved_searches").select("name, email_digest, query").eq("id", searchId).maybeSingle() : Promise.resolve({ data: null }),
    ]);
    if (!settings?.email_notifications || !search?.email_digest) {
      await skip("Email was turned off.");
      continue;
    }
    try {
      const { data: user } = await db.auth.admin.getUserById(d.user_id);
      const to = user.user?.email;
      if (!to) {
        await skip("The account has no email address.");
        continue;
      }
      const { data: matches } = await db.from("saved_search_matches").select("job_id, jobs(id, title, company, location_text)").eq("notification_id", d.notification_id).limit(50);
      const jobs = (matches ?? []).filter((m) => m.jobs).map((m) => ({ jobId: m.jobs!.id, title: m.jobs!.title, company: m.jobs!.company, place: m.jobs!.location_text }));
      if (!jobs.length) {
        await skip("Those jobs are no longer listed.");
        continue;
      }
      const one = `${config.appUrl}/api/email/unsubscribe?token=${unsubscribeToken({ userId: d.user_id, searchId }, config.secret, now.getTime())}`;
      const all = `${config.appUrl}/api/email/unsubscribe?token=${unsubscribeToken({ userId: d.user_id, searchId: null }, config.secret, now.getTime())}`;
      const mail = renderDigest({ searchName: search.name, jobs, appUrl: config.appUrl, unsubscribeUrl: one, unsubscribeAllUrl: all });
      await mailer.send({ to, ...mail, headers: { "List-Unsubscribe": `<${one}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" } });
      await db.from("email_deliveries").update({ status: "sent", sent_at: new Date().toISOString(), attempts: d.attempts + 1, last_error: null }).eq("id", d.id);
      out.sent++;
    } catch (e) {
      const attempts = d.attempts + 1;
      const failed = attempts >= BACKOFF_MIN.length;
      await db
        .from("email_deliveries")
        .update({ attempts, status: failed ? "failed" : "pending", last_error: errorMessage(e), next_attempt_at: new Date(now.getTime() + BACKOFF_MIN[Math.min(attempts, BACKOFF_MIN.length) - 1] * 60_000).toISOString() })
        .eq("id", d.id);
      out.failed++;
      log("warn", "cron.alerts", "email_failed", { delivery: d.id, attempts, message: errorMessage(e) });
    }
  }
  return out;
}

/** The whole run, within the deadline. */
export async function runAlerts(db: Db, deadline: number, now = new Date()) {
  const searches = await runDueSearches(db, now, deadline);
  const reminders = await notifyDueReminders(db, now);
  const interviews = await notifyUpcomingInterviews(db, now);
  const weekly = await notifyWeeklySummaries(db, now);
  const sources = await notifySourceProblems(db);
  const email = Date.now() < deadline ? await sendQueuedEmails(db, now) : { sent: 0, failed: 0, skipped: 0 };
  return { ...searches, reminders, interviews, weekly, sources, email };
}

