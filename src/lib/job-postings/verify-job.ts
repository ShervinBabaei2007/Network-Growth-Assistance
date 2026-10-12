import "server-only";
import { after } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { safeFetch, UnsafeUrlError, type SafeFetchOptions } from "@/lib/net/safe-fetch";
import { jobFixturesEnabled } from "@/lib/runtime-mode";
import type { AtsKind } from "./ats/types";
import { JobicyProvider, type JobicyStatusValue } from "./providers/jobicy";
import { AGGREGATOR_SOURCES, type AggregatorSource } from "./providers/types";
import { checkFinalDestination, checkJobLink, canonicalUrl, type JobVerificationStatus, type LinkContext } from "./verify-url";

/**
 * Checks that a job's link still leads to a live posting. "Verified" needs evidence; a
 * site that blocks automated checks leaves the job "not yet verified", never "failed",
 * because one blocked request says nothing about whether the posting is real.
 */

export type LiveCheck = { status: JobVerificationStatus; note: string | null; finalUrl: string | null };

/** Words that ATS and careers sites show on a posting that has closed. */
const CLOSED_MARKERS =
  /no longer (accepting applications|available|open|active)|position has been filled|job (has been |is )?(closed|expired|removed)|this (job|posting|position|role) (is no longer|has expired|has been closed|was removed)|posting (has )?expired|job not found|page not found|we couldn.t find (that|the) (job|page)|the job you are looking for/i;

/** Whether a fetched page mentions the job: a distinctive word of its title, or the company. */
export function pageMentionsJob(body: string, jobTitle: string | null | undefined, company: string | null | undefined): boolean {
  if (!jobTitle) return true;
  const text = body.slice(0, 64 * 1024).replace(/<[^>]+>/g, " ").toLowerCase();
  // Pages built in the browser carry little text before their script runs: no evidence either way.
  if (text.replace(/\s+/g, " ").trim().length < 200) return true;
  const words = jobTitle
    .toLowerCase()
    .split(/[^a-z0-9+#]+/)
    .filter((w) => w.length >= 4 && !["senior", "junior", "intern", "remote", "hybrid", "lead"].includes(w));
  return words.some((w) => text.includes(w)) || Boolean(company && text.includes(company.toLowerCase()));
}

export async function checkUrlLive(applyUrl: string | null, ctx: LinkContext, company: string | null, opts: SafeFetchOptions & { jobTitle?: string | null } = {}): Promise<LiveCheck> {
  const shape = checkJobLink(applyUrl, ctx);
  if (!shape.ok) return { status: shape.status, note: shape.reason, finalUrl: null };
  let res;
  try {
    res = await safeFetch(shape.url.toString(), opts);
  } catch (e) {
    if (e instanceof UnsafeUrlError) return { status: "failed_validation", note: `The link points somewhere it shouldn't (${e.message})`, finalUrl: null };
    return { status: "pending_validation", note: "Couldn't reach the site to check the link", finalUrl: null };
  }
  const finalUrl = res.url;
  if (res.status === 404 || res.status === 410) return { status: "expired", note: "The posting was removed (the page no longer exists)", finalUrl };
  if ([401, 403, 405, 406, 429].includes(res.status) || res.status >= 500) {
    return { status: "pending_validation", note: "Couldn't check automatically (the site blocks automated checks or is busy)", finalUrl };
  }
  if (res.status < 200 || res.status >= 300) return { status: "pending_validation", note: `The site answered ${res.status}`, finalUrl };
  if (CLOSED_MARKERS.test(res.body.slice(0, 64 * 1024))) return { status: "expired", note: "The page says this job is no longer accepting applications", finalUrl };
  const destination = checkFinalDestination(finalUrl, company, ctx);
  if (!destination.ok) return { status: destination.status, note: destination.reason, finalUrl };
  // The page must be about this job, not some other listing or a generic page.
  if (!pageMentionsJob(res.body, opts.jobTitle, company)) return { status: "pending_validation", note: "The page doesn't mention this job's title or company", finalUrl };
  return { status: "verified", note: null, finalUrl };
}

const RECHECK_AFTER_MS = 6 * 3600_000;

type JobRow = {
  id: string;
  source: string;
  apply_url: string | null;
  verification_status: string;
  verified_at: string | null;
  closed_at: string | null;
  company: string | null;
  title?: string;
  external_id: string;
  employer_id: string | null;
  verification_note?: string | null;
  updated_at?: string;
};

/** Whether a job's link is due a live check now. */
export function needsRecheck(job: Pick<JobRow, "closed_at" | "apply_url" | "verification_status" | "verified_at" | "verification_note" | "updated_at">, now = Date.now()): boolean {
  if (job.closed_at || !job.apply_url) return false;
  if (job.verification_status === "expired" || job.verification_status === "failed_validation") return false;
  if (job.verification_status === "pending_validation" || job.verification_status === "unavailable") {
    // Checked before and inconclusive: try again only after a while, not on every view.
    return !job.verification_note || !job.updated_at || now - Date.parse(job.updated_at) > RECHECK_AFTER_MS;
  }
  return !job.verified_at || now - Date.parse(job.verified_at) > RECHECK_AFTER_MS;
}

/**
 * How Jobicy's own status for a job maps onto verification. "closed" is clear evidence the
 * job is gone. "active" only makes the job eligible: its link must still pass the usual
 * live check. "unknown" proves nothing, so the job stays unverified and its link isn't
 * checked (a page that loads is not enough when Jobicy itself can't vouch for the job).
 */
export function jobicyStatusEffect(status: JobicyStatusValue): { status: "expired"; note: string } | { status: "pending_validation"; note: string } | "check_link" {
  if (status === "closed") return { status: "expired", note: "Jobicy says this job is closed" };
  if (status === "unknown") return { status: "pending_validation", note: "Jobicy couldn't confirm this job is still open" };
  return "check_link";
}

type JobicyStatusSource = Pick<JobicyProvider, "jobStatus">;

/**
 * Runs a live check and stores the result. Board jobs are only ever downgraded on clear
 * evidence (removed or closed). A Jobicy job is first checked with Jobicy's own status.
 */
export async function recheckJob(
  job: JobRow,
  employer?: { ats: AtsKind; board_token: string; careers_url: string | null; name: string } | null,
  opts: { jobicyStatus?: JobicyStatusValue; jobicy?: JobicyStatusSource } = {},
): Promise<LiveCheck | null> {
  if (jobFixturesEnabled() || !needsRecheck(job)) return null;
  const db = createAdminClient();
  const now = new Date().toISOString();
  const externalId = job.external_id.replace(/^(adzuna|jobicy|remotive|arbeitnow|usajobs):/, "");

  if (job.source === "jobicy") {
    const status =
      opts.jobicyStatus ??
      (await (opts.jobicy ?? new JobicyProvider())
        .jobStatus([externalId], AbortSignal.timeout(8000))
        .then((m) => m.get(externalId) ?? "unknown")
        .catch(() => null));
    // Jobicy didn't answer: no evidence either way; try again later.
    if (status === null) return null;
    const effect = jobicyStatusEffect(status);
    if (effect !== "check_link") {
      await db
        .from("jobs")
        .update({ verification_status: effect.status, verified_at: null, verification_note: effect.note, ...(effect.status === "expired" ? { closed_at: now } : {}) })
        .eq("id", job.id);
      return { status: effect.status, note: effect.note, finalUrl: null };
    }
  }

  const ctx: LinkContext =
    job.source === "ats" && employer
      ? { source: "ats", ats: employer.ats, boardToken: employer.board_token, externalId: job.external_id, careersUrl: employer.careers_url, company: job.company ?? employer.name }
      : (AGGREGATOR_SOURCES as readonly string[]).includes(job.source)
        ? { source: job.source as AggregatorSource, externalId }
        : { source: "manual" };
  const r = await checkUrlLive(job.apply_url, ctx, job.company, { jobTitle: job.title });
  if (job.source === "ats") {
    // The board listing is the evidence for a board job; a live check can only show it has gone.
    if (r.status === "expired") await db.from("jobs").update({ verification_status: "expired", verified_at: null, verification_note: r.note }).eq("id", job.id);
    else if (r.status === "verified") await db.from("jobs").update({ verified_at: now, final_url: r.finalUrl }).eq("id", job.id);
    return r;
  }
  await db
    .from("jobs")
    .update({
      verification_status: r.status,
      verified_at: r.status === "verified" ? now : null,
      verification_note: r.note?.slice(0, 300) ?? null,
      final_url: r.finalUrl,
      canonical_url: r.finalUrl ? canonicalUrl(new URL(r.finalUrl)) : null,
    })
    .eq("id", job.id);
  return r;
}

/** After the page is sent, checks a job's link if it's due. Never delays the page. */
export function scheduleRecheck(job: JobRow): void {
  if (!needsRecheck(job) || jobFixturesEnabled()) return;
  after(async () => {
    const employer = job.employer_id
      ? (await createAdminClient().from("employers").select("ats, board_token, careers_url, name").eq("id", job.employer_id).maybeSingle()).data
      : null;
    await recheckJob(job, employer).catch(() => null);
  });
}

/**
 * After a search page is sent, checks the links of search results not checked yet (the
 * most recently seen first, so this search's own results), so they can show as verified
 * on the next load instead of waiting for the crawl job. Never delays the page; results
 * already checked aren't picked again, so reloading costs one small query.
 */
export function scheduleVerifyPending(limit = 25): void {
  if (jobFixturesEnabled()) return;
  after(async () => {
    await verifyPending(limit, Date.now() + 25_000).catch(() => 0);
  });
}

/** Checks up to `limit` unchecked search results (Jobicy, Remotive, Adzuna) whose links haven't been checked yet. */
export async function verifyPending(limit = 15, deadline = Date.now() + 20_000, jobicy: JobicyStatusSource = new JobicyProvider()): Promise<number> {
  if (jobFixturesEnabled()) return 0;
  const db = createAdminClient();
  const { data } = await db
    .from("jobs")
    .select("id, source, apply_url, verification_status, verified_at, closed_at, company, title, external_id, employer_id, verification_note, updated_at")
    .in("source", [...AGGREGATOR_SOURCES])
    .eq("verification_status", "pending_validation")
    .is("verification_note", null)
    .is("closed_at", null)
    .order("last_seen_at", { ascending: false })
    .limit(limit);
  const queue = [...(data ?? [])];
  // Jobicy answers for up to 100 of its jobs in one free call, instead of one call per job.
  const jobicyIds = queue.filter((j) => j.source === "jobicy").map((j) => j.external_id.replace(/^jobicy:/, ""));
  const statuses = jobicyIds.length ? await jobicy.jobStatus(jobicyIds, AbortSignal.timeout(8000)).catch(() => null) : null;
  let checked = 0;
  // Two at a time, so no one site sees a burst.
  const worker = async () => {
    while (queue.length && Date.now() < deadline) {
      const job = queue.shift()!;
      const jobicyStatus = job.source === "jobicy" ? statuses?.get(job.external_id.replace(/^jobicy:/, "")) : undefined;
      // Jobicy didn't answer this round: leave its jobs for the next one.
      if (job.source === "jobicy" && !jobicyStatus) continue;
      await recheckJob(job, null, { jobicyStatus, jobicy }).catch(() => null);
      checked++;
    }
  };
  await Promise.all([worker(), worker()]);
  return checked;
}
