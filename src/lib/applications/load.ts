import "server-only";
import type { createClient } from "@/lib/supabase/server";
import type { Stage } from "./stages";

type Db = Awaited<ReturnType<typeof createClient>>;

/** Bounded: a person's own tracker rarely nears this, and the page says so if it does. */
export const LIST_LIMIT = 500;

export type ApplicationSummary = {
  id: string;
  jobId: string | null;
  attempt: number;
  stage: Stage;
  title: string;
  company: string | null;
  location: string | null;
  appliedOn: string | null;
  stageChangedAt: string;
  version: number;
  nextInterviewAt: string | null;
  lastEventAt: string | null;
  openReminders: number;
};

/** Every application with what the board and list need, in one round of queries. */
export async function loadApplications(db: Db): Promise<{ apps: ApplicationSummary[]; truncated: boolean } | null> {
  const { data: rows, error } = await db
    .from("applications")
    .select("id, job_id, attempt, stage, title, company, location, applied_on, stage_changed_at, version")
    .order("stage_changed_at", { ascending: false })
    .limit(LIST_LIMIT + 1);
  if (error) return null;
  const apps = rows.slice(0, LIST_LIMIT);
  const ids = apps.map((a) => a.id);
  const now = new Date().toISOString();
  const [interviews, events, reminders] = ids.length
    ? await Promise.all([
        db.from("application_interviews").select("application_id, starts_at").in("application_id", ids).gte("starts_at", now).order("starts_at"),
        db.from("application_events").select("application_id, occurred_at").in("application_id", ids).order("occurred_at", { ascending: false }).limit(5000),
        db.from("application_reminders").select("application_id").in("application_id", ids).is("done_at", null),
      ])
    : [{ data: [] }, { data: [] }, { data: [] }];
  const nextInterview = new Map<string, string>();
  for (const i of interviews.data ?? []) if (!nextInterview.has(i.application_id)) nextInterview.set(i.application_id, i.starts_at);
  const lastEvent = new Map<string, string>();
  for (const e of events.data ?? []) if (!lastEvent.has(e.application_id)) lastEvent.set(e.application_id, e.occurred_at);
  const reminderCount = new Map<string, number>();
  for (const r of reminders.data ?? []) reminderCount.set(r.application_id, (reminderCount.get(r.application_id) ?? 0) + 1);

  return {
    truncated: rows.length > LIST_LIMIT,
    apps: apps.map((a) => ({
      id: a.id,
      jobId: a.job_id,
      attempt: a.attempt,
      stage: a.stage,
      title: a.title,
      company: a.company,
      location: a.location,
      appliedOn: a.applied_on,
      stageChangedAt: a.stage_changed_at,
      version: a.version,
      nextInterviewAt: nextInterview.get(a.id) ?? null,
      lastEventAt: lastEvent.get(a.id) ?? null,
      openReminders: reminderCount.get(a.id) ?? 0,
    })),
  };
}

export type DueReminder = { id: string; applicationId: string; dueAt: string; text: string; title: string; company: string | null };

/** Open reminders due before `until` (overdue ones included), soonest first. */
export async function loadDueReminders(db: Db, until: Date, limit = 20): Promise<DueReminder[] | null> {
  const { data, error } = await db
    .from("application_reminders")
    .select("id, application_id, due_at, text, applications(title, company)")
    .is("done_at", null)
    .lte("due_at", until.toISOString())
    .order("due_at")
    .limit(limit);
  if (error) return null;
  return data.map((r) => ({ id: r.id, applicationId: r.application_id, dueAt: r.due_at, text: r.text, title: r.applications?.title ?? "Application", company: r.applications?.company ?? null }));
}
