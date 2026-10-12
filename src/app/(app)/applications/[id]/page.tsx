import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ExternalLink } from "lucide-react";
import { PeopleAtCompany } from "@/components/companies/people-at-company";
import { LoadError } from "@/components/load-error";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { companySlug } from "@/lib/companies/match";
import { formatDateOnly, formatDateTime, relativeDays, toLocalInput } from "@/lib/applications/format";
import { describeMove, formatPay, STAGE_LABEL } from "@/lib/applications/stages";
import { createClient } from "@/lib/supabase/server";
import { ApplicationDetail, type DetailData } from "./detail";

export const metadata = { title: "Application · Network Growth" };

const isUuid = (s: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);

export default function ApplicationPage({ params }: PageProps<"/applications/[id]">) {
  return (
    <Suspense fallback={<p className="text-sm text-muted-foreground">Loading the application…</p>}>
      <Application params={params} />
    </Suspense>
  );
}

const EVENT_LABEL: Record<string, string> = {
  note: "Note",
  response: "Response",
  interview: "Interview",
  reminder: "Reminder",
  contact: "Contact",
  document: "Document",
  created: "Added",
  migrated: "Added",
};

async function Application({ params }: Pick<PageProps<"/applications/[id]">, "params">) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const supabase = await createClient();
  const { data: app, error } = await supabase.from("applications").select("*").eq("id", id).maybeSingle();
  if (error) return <LoadError what="this application" />;
  if (!app) notFound();

  const [{ data: settings }, events, interviews, reminders, contacts, documents, people, resumes, otherAttempts, job] = await Promise.all([
    supabase.from("settings").select("timezone").single(),
    supabase.from("application_events").select("id, kind, from_stage, to_stage, occurred_at, detail").eq("application_id", id).order("occurred_at", { ascending: false }).limit(200),
    supabase.from("application_interviews").select("*").eq("application_id", id).order("starts_at"),
    supabase.from("application_reminders").select("*").eq("application_id", id).order("due_at"),
    supabase.from("application_contacts").select("person_id, role, network_people(full_name, current_title, current_company)").eq("application_id", id),
    supabase.from("application_documents").select("id, kind, label, created_at, tailored_document_id, resume_id").eq("application_id", id).order("created_at"),
    supabase.from("network_people").select("id, full_name, current_company").eq("saved", true).order("full_name").limit(300),
    supabase.from("resumes").select("id, label, created_at, is_active").order("created_at", { ascending: false }),
    app.job_id ? supabase.from("applications").select("id, attempt, stage").eq("job_id", app.job_id).neq("id", id).order("attempt") : Promise.resolve({ data: [] as { id: string; attempt: number; stage: string }[] }),
    app.job_id ? supabase.from("jobs").select("id, verification_status, closed_at").eq("id", app.job_id).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const tz = settings?.timezone ?? "America/Vancouver";
  const now = new Date();

  // Document versions written for this job: every tailored resume, CV and cover letter.
  let tailored: { id: string; label: string }[] = [];
  if (app.job_id) {
    const { data: matches } = await supabase.from("job_matches").select("id").eq("job_id", app.job_id);
    const matchIds = (matches ?? []).map((m) => m.id);
    if (matchIds.length) {
      const { data } = await supabase.from("tailored_documents").select("id, kind, label, created_at, edited").in("match_id", matchIds).is("deleted_at", null).order("created_at", { ascending: false });
      const name = { resume: "Tailored resume", cover_letter: "Cover letter", cv: "Tailored CV" } as Record<string, string>;
      tailored = (data ?? []).map((d) => ({ id: d.id, label: d.label ?? `${name[d.kind] ?? "Document"}, ${formatDateTime(d.created_at, tz)}${d.edited ? " (edited)" : ""}` }));
    }
  }

  const data: DetailData = {
    id: app.id,
    stage: app.stage,
    version: app.version,
    attempt: app.attempt,
    jobId: app.job_id,
    timezone: tz,
    details: {
      notes: app.notes ?? "",
      appliedOn: app.applied_on ?? "",
      payAmount: app.offered_pay_amount === null ? "" : String(app.offered_pay_amount),
      payCurrency: app.offered_pay_currency ?? "",
      payPeriod: (app.offered_pay_period ?? "") as DetailData["details"]["payPeriod"],
    },
    timeline: (events.data ?? []).map((e) => ({
      id: e.id,
      kind: e.kind,
      label: e.kind === "stage" || e.kind === "reopened" ? describeMove(e.from_stage, e.to_stage!) : (EVENT_LABEL[e.kind] ?? e.kind),
      detail: e.kind === "created" || e.kind === "migrated" ? [e.to_stage ? `As ${STAGE_LABEL[e.to_stage]}` : null, e.detail].filter(Boolean).join(". ") : e.detail,
      when: formatDateTime(e.occurred_at, tz),
      removable: e.kind === "note" || e.kind === "response",
    })),
    interviews: (interviews.data ?? []).map((i) => ({
      id: i.id,
      when: formatDateTime(i.starts_at, tz),
      relative: relativeDays(i.starts_at, tz, now),
      past: Date.parse(i.starts_at) < now.getTime(),
      startsLocal: toLocalInput(i.starts_at, i.timezone),
      timezone: i.timezone,
      durationMinutes: i.duration_minutes,
      kind: i.kind as DetailData["interviews"][number]["kind"],
      location: i.location ?? "",
      notes: i.notes ?? "",
      scheduledIn: i.timezone === tz ? null : `${toLocalInput(i.starts_at, i.timezone).replace("T", " ")} ${i.timezone}`,
    })),
    reminders: (reminders.data ?? []).map((r) => ({ id: r.id, text: r.text, when: formatDateTime(r.due_at, tz), relative: relativeDays(r.due_at, tz, now), overdue: !r.done_at && Date.parse(r.due_at) < now.getTime(), done: Boolean(r.done_at) })),
    contacts: (contacts.data ?? []).map((c) => ({ personId: c.person_id, role: c.role, name: c.network_people?.full_name ?? "Unknown", title: [c.network_people?.current_title, c.network_people?.current_company].filter(Boolean).join(" · ") })),
    documents: (documents.data ?? []).map((d) => ({ id: d.id, label: d.label, linkedOn: formatDateTime(d.created_at, tz), sourceGone: !d.tailored_document_id && !d.resume_id })),
    options: {
      people: (people.data ?? []).map((p) => ({ id: p.id, label: p.current_company ? `${p.full_name} (${p.current_company})` : p.full_name })),
      tailored,
      resumes: (resumes.data ?? []).map((r) => ({ id: r.id, label: `Resume: ${r.label}${r.is_active ? " (current)" : ""}` })),
    },
    otherAttempts: (otherAttempts.data ?? []).map((o) => ({ id: o.id, label: `Attempt ${o.attempt}: ${STAGE_LABEL[o.stage as keyof typeof STAGE_LABEL] ?? o.stage}` })),
    nowLocal: toLocalInput(now.toISOString(), tz),
  };
  const pay = formatPay(app.offered_pay_amount, app.offered_pay_currency, app.offered_pay_period);
  const jobGone = app.job_id === null;

  return (
    <div className="grid gap-6">
      <PageHeader
        back={{ href: "/applications", label: "Applications" }}
        title={app.title}
        meta={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            {app.company ? (
              <Link href={`/companies/${companySlug(app.company)}`} className="hover:text-foreground hover:underline">
                {app.company}
              </Link>
            ) : null}
            {app.location ? <span>{app.location}</span> : null}
            <Badge variant="secondary">{STAGE_LABEL[app.stage]}</Badge>
            {app.attempt > 1 ? <span>Attempt {app.attempt}</span> : null}
            {app.applied_on ? <span>Applied {formatDateOnly(app.applied_on)}</span> : null}
            {pay ? <span>Offered {pay}</span> : null}
          </span>
        }
        actions={
          app.job_id ? (
            <Link href={`/jobs/${app.job_id}`} className="inline-flex items-center gap-1 text-sm text-primary hover:underline">
              View the job <ExternalLink aria-hidden className="size-3.5" />
            </Link>
          ) : null
        }
      />
      {jobGone ? (
        <p role="status" className="rounded-lg border bg-muted/50 p-3 text-sm text-muted-foreground">
          The original posting is no longer in Jobs. This application keeps the title, company and link it had when you tracked it.
          {app.apply_url ? (
            <>
              {" "}
              <a href={app.apply_url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                Last known link
              </a>{" "}
              (it may no longer work).
            </>
          ) : null}
        </p>
      ) : job.data?.closed_at || job.data?.verification_status === "expired" ? (
        <p role="status" className="rounded-lg border bg-muted/50 p-3 text-sm text-muted-foreground">
          This posting has closed. Your application and its history are kept.
        </p>
      ) : null}
      <ApplicationDetail data={data} />
      {app.company ? (
        <Suspense fallback={null}>
          <PeopleAtCompany company={app.company} applicationId={app.id} />
        </Suspense>
      ) : null}
    </div>
  );
}
