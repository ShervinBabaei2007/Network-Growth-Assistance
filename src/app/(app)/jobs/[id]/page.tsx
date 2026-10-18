import { Suspense } from "react";
import { PageSkeleton } from "@/components/page-skeleton";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowUpRight, Building2, Check, Clock, MapPin, Minus, X } from "lucide-react";
import { PeopleAtCompany } from "@/components/companies/people-at-company";
import { ApplyLink } from "@/components/jobs/apply-link";
import { FitScore, SourceTag, TIER_STYLE, VerificationBadge } from "@/components/jobs/job-visuals";
import { PageHeader } from "@/components/page-header";
import { ToastOnMount } from "@/components/toast/toast-on-mount";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { STAGE_LABEL } from "@/lib/applications/stages";
import { companySlug } from "@/lib/companies/match";
import { aiAccess } from "@/lib/job-postings/ai";
import { applyState } from "@/lib/job-postings/apply-state";
import type { Comparison } from "@/lib/job-postings/compare";
import { sameJob, type DedupeItem } from "@/lib/job-postings/dedupe";
import { CoverLetterDoc, TailoredResumeDoc, type GuardIssue } from "@/lib/job-postings/documents";
import { explainFit } from "@/lib/job-postings/fit";
import type { NotesReport } from "@/lib/job-postings/improvement-notes";
import { DOC_METHOD_LABELS, NOTES_METHOD_LABELS, placeLabel, postedLabel, timeAgo } from "@/lib/job-postings/labels";
import { LEVEL_LABELS, WORKPLACE_LABELS, type Workplace } from "@/lib/job-postings/levels";
import { StoredFit } from "@/lib/job-postings/schemas";
import { loadActiveResume, scoreJobs } from "@/lib/job-postings/service";
import { jobServices } from "@/lib/job-postings/services";
import { alsoListedOn, jobSource } from "@/lib/job-postings/source";
import { skillsIn } from "@/lib/job-postings/taxonomy";
import type { Requirement, RequirementResult } from "@/lib/job-postings/types";
import { scheduleRecheck } from "@/lib/job-postings/verify-job";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";
import { ComparisonPanel } from "./comparison-panel";
import { GuardReport, LetterDocEditor, ResumeDocEditor } from "./document-editor";
import { NotesView } from "./notes-view";
import { OlderVersions } from "./older-versions";
import { CheckFitButton, StatusActions, WorkActions } from "./posting-actions";

export const metadata = { title: "Job · Jobs · Network Growth" };
// Tailoring makes up to three model calls (reading the posting, then up to two writes).
export const maxDuration = 60;

export default function JobPage({ params }: PageProps<"/jobs/[id]">) {
  return (
    <Suspense fallback={<PageSkeleton label="Loading…" />}>
      <Job params={params} />
    </Suspense>
  );
}

const STATUS_ICON = { met: Check, partial: Minus, missing: X } as const;
const STATUS_TEXT = { met: "Met", partial: "Partly met", missing: "Not shown" } as const;
const STATUS_TONE = { met: "bg-success-soft text-success", partial: "bg-warning-soft text-warning", missing: "bg-danger-soft text-destructive" } as const;
const skillNames = (t: string) => skillsIn(t).map((s) => s.name);

async function Job({ params }: Pick<PageProps<"/jobs/[id]">, "params">) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims.sub;
  const [{ data: job }, resume, { data: state }, ai, { data: tracked }] = await Promise.all([
    supabase.from("jobs").select("*").eq("id", id).maybeSingle(),
    loadActiveResume(supabase),
    supabase.from("job_user_states").select("status").eq("job_id", id).maybeSingle(),
    aiAccess(supabase),
    supabase.from("applications").select("id, stage, attempt").eq("job_id", id).order("attempt", { ascending: false }).limit(1),
  ]);
  const application = tracked?.[0] ?? null;
  if (!job || !userId) notFound();
  const { data: employer } = job.employer_id ? await supabase.from("employers").select("name, ats, careers_url").eq("id", job.employer_id).maybeSingle() : { data: null };
  // A link checked more than a few hours ago is checked again after this page is sent.
  scheduleRecheck(job);

  let { data: match } = resume ? await supabase.from("job_matches").select("*").eq("job_id", id).eq("resume_id", resume.id).maybeSingle() : { data: null };
  // Check (or recheck after a resume change) right away: rules and database queries, no outside calls.
  if (resume && (!match || Date.parse(match.updated_at) < Date.parse(resume.updatedAt))) {
    await scoreJobs(supabase, userId, resume, [id], jobServices().embedder);
    ({ data: match } = await supabase.from("job_matches").select("*").eq("job_id", id).eq("resume_id", resume.id).maybeSingle());
  }
  const [{ data: docs }, { data: notesRows }, { data: twins }] = await Promise.all([
    match
      ? supabase
          .from("tailored_documents")
          .select("id, kind, mode, method, label, generated, edited, guard_report, comparison, created_at, updated_at")
          .eq("match_id", match.id)
          .is("deleted_at", null)
          .order("created_at", { ascending: false })
      : Promise.resolve({ data: [] }),
    match
      ? supabase.from("improvement_notes").select("id, report, dismissed, reason, method, created_at, resume_updated_at").eq("match_id", match.id).order("created_at", { ascending: false }).limit(1)
      : Promise.resolve({ data: [] }),
    job.dedupe_key ? supabase.from("jobs").select("id, source, apply_url, verification_status, dedupe_key, desc_fingerprint, description_is_partial, canonical_url, posted_at").eq("dedupe_key", job.dedupe_key).neq("id", job.id).is("closed_at", null).limit(5) : Promise.resolve({ data: [] }),
  ]);
  const fit = match ? StoredFit.safeParse(match.requirement_results) : null;
  const originals: Record<string, string> = {};
  if (resume) for (const e of [...resume.profile.experience, ...resume.profile.projects, ...resume.profile.education]) for (const b of e.bullets) originals[b.id] = b.text;
  const aiStatus = ai.ok
    ? { available: true, note: ai.source === "own" ? "AI uses your own key." : ai.remaining === null ? "AI is on." : `AI: ${ai.remaining} free use${ai.remaining === 1 ? "" : "s"} left today.` }
    : { available: false, note: `${ai.reason} Without AI, “Tailor Resume” gives you Improvement Notes instead.` };
  const source = jobSource(job, employer);
  const results = fit?.success ? fit.data.results : [];
  const requirements = fit?.success ? fit.data.requirements : [];
  const resultFor = (r: Requirement) => results.find((x) => x.requirementId === r.id);
  const explanation = explainFit(requirements, results, skillNames);
  const apply = applyState(job);
  const notes = notesRows?.[0];
  const byKind = (kind: string) => (docs ?? []).filter((d) => d.kind === kind);
  const alsoOn = (twins ?? []).filter((t) => sameJob(job as unknown as DedupeItem, t as unknown as DedupeItem));
  const role = `${job.title}${job.company ? ` at ${job.company}` : ""}`;

  return (
    <div className="grid gap-6">
      {job.closed_at || job.verification_status === "expired" ? (
        <ToastOnMount specs={[{ key: `expired:${job.id}`, type: "warning", title: "This job posting appears to have expired.", description: "Apply is turned off. It stays in your saved jobs for your records." }]} />
      ) : null}
      <PageHeader
        back={{ href: "/jobs", label: "Jobs" }}
        title={job.title}
        meta={
          <span className="flex flex-wrap items-center gap-x-4 gap-y-1">
            {job.company ? (
              <Link href={`/companies/${companySlug(job.company)}`} className="inline-flex items-center gap-1 font-medium text-foreground hover:underline">
                <Building2 aria-hidden className="size-4 text-muted-foreground" />
                {job.company}
              </Link>
            ) : null}
            <span className="inline-flex items-center gap-1">
              <MapPin aria-hidden className="size-4" />
              {placeLabel(job)}
            </span>
            {job.workplace_type ? <span>{WORKPLACE_LABELS[job.workplace_type as Workplace]}</span> : null}
            <span className="inline-flex items-center gap-1">
              <Clock aria-hidden className="size-4" />
              {postedLabel(job)}
            </span>
            {job.salary ? <span>{job.salary}</span> : null}
            {job.employment_type ? <span>{job.employment_type}</span> : null}
            {job.experience_level ? (
              <span>
                {LEVEL_LABELS[job.experience_level as keyof typeof LEVEL_LABELS]}
                {job.level_source === "title" ? <span className="text-muted-foreground"> (from title)</span> : null}
              </span>
            ) : null}
          </span>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem] lg:items-start">
        <div className="grid min-w-0 gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Fit with your resume</CardTitle>
              {match ? (
                <CardDescription>
                  {match.method === "semantic" ? "Matched by skills and by meaning. " : "Matched by skills. "}Every “met” points to a line in your resume. Years, degree, clearance and work
                  authorization are decided by rules.{job.description_is_partial ? " This source gave only part of the description, so the check is partial." : ""}
                </CardDescription>
              ) : null}
            </CardHeader>
            <CardContent className="grid gap-5">
              {!resume ? (
                <p className="text-sm">
                  <Link href="/jobs/resume" className="font-medium text-primary underline underline-offset-4">
                    Import your resume
                  </Link>{" "}
                  to check this job.
                </p>
              ) : !match ? (
                <CheckFitButton jobId={job.id} />
              ) : (
                <>
                  <div className="flex flex-wrap items-center gap-4">
                    <FitScore tier={match.tier} score={match.fit_score} size="lg" />
                    <div className="grid min-w-0 flex-1 gap-1">
                      <p className={cn("font-semibold", TIER_STYLE[match.tier].text)}>{TIER_STYLE[match.tier].label}</p>
                      {match.summary ? <p className="text-sm text-muted-foreground">{match.summary}</p> : null}
                      <FitExplanationLine e={explanation} />
                    </div>
                  </div>
                  {match.exclusion_reasons.length ? (
                    <div className="grid gap-1 rounded-lg border border-destructive/30 bg-danger-soft p-3">
                      <p className="text-sm font-medium">Why it was set aside</p>
                      <ul className="list-disc pl-5 text-sm">
                        {match.exclusion_reasons.map((r) => (
                          <li key={r}>{r}</li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                  {requirements.length ? (
                    <div className="grid gap-5 md:grid-cols-2">
                      <RequirementList title="Required" items={requirements.filter((r) => r.kind === "must")} resultFor={resultFor} />
                      <RequirementList title="Nice to have" items={requirements.filter((r) => r.kind === "nice")} resultFor={resultFor} />
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">No clear requirements were found in this posting.</p>
                  )}
                </>
              )}
            </CardContent>
          </Card>

          {match ? (
            <Card id="work" className="scroll-mt-24">
              <CardHeader>
                <CardTitle className="text-lg">Your resume for this job</CardTitle>
                <CardDescription>Built only from what your resume says. Your resume itself is never changed here.</CardDescription>
              </CardHeader>
              <CardContent>
                <WorkActions jobId={job.id} role={role} excluded={match.tier === "excluded"} ai={aiStatus} />
              </CardContent>
            </Card>
          ) : null}

          {notes ? (
            <Card id="notes" className="scroll-mt-24">
              <CardHeader>
                <CardTitle className="text-lg">Resume Improvement Notes</CardTitle>
                <CardDescription>What you could change yourself to fit this job, and why. These notes don&apos;t change your resume.</CardDescription>
              </CardHeader>
              <CardContent>
                <NotesView
                  key={notes.id}
                  notesId={notes.id}
                  report={notes.report as unknown as NotesReport}
                  dismissed={notes.dismissed}
                  reason={notes.reason}
                  methodLabel={NOTES_METHOD_LABELS[notes.method as keyof typeof NOTES_METHOD_LABELS]}
                  made={timeAgo(notes.created_at)}
                  stale={Boolean(resume && Date.parse(notes.resume_updated_at) < Date.parse(resume.updatedAt))}
                />
              </CardContent>
            </Card>
          ) : null}

          <div id="documents" className="grid scroll-mt-24 gap-6">
            {(["resume", "cv", "cover_letter"] as const).map((kind) => {
              const list = byKind(kind);
              if (!list.length) return null;
              return (
                <div key={kind} className="grid gap-3">
                  <DocCard doc={list[0]} originals={originals} />
                  {list.length > 1 ? (
                    <OlderVersions
                      versions={list.slice(1).map((d) => ({ id: d.id, label: d.label ?? (kind === "cover_letter" ? "Cover letter" : "Tailored resume"), detail: `${DOC_METHOD_LABELS[d.method as keyof typeof DOC_METHOD_LABELS] ?? d.method} · ${timeAgo(d.created_at)}${d.edited ? " · edited" : ""}` }))}
                    />
                  ) : null}
                </div>
              );
            })}
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">The posting</CardTitle>
              {job.description_is_partial ? <CardDescription>This source shows only part of the description. Open the listing for the full text.</CardDescription> : null}
            </CardHeader>
            <CardContent>
              <div className="max-h-[36rem] max-w-prose overflow-y-auto text-sm leading-relaxed whitespace-pre-line">{job.description || "The source didn't include a description. Open the listing for details."}</div>
            </CardContent>
          </Card>
        </div>

        {/* Actions: always in reach, beside the content on wide screens. */}
        <aside className="grid gap-4 lg:sticky lg:top-20" aria-label="Apply and track">
          <Card size="sm">
            <CardContent className="grid gap-3">
              <VerificationBadge status={job.closed_at ? "expired" : job.verification_status} />
              {apply.enabled ? (
                <ApplyLink
                  jobId={job.id}
                  href={apply.href}
                  status={state?.status ?? null}
                  className={cn(buttonVariants(), "w-full")}
                  panelClassName="left-0 right-auto w-full min-w-64"
                  documents={[
                    ...(docs ?? []).map((d) => ({ value: `t:${d.id}`, label: d.label ?? `${d.kind === "cover_letter" ? "Cover letter" : d.kind === "cv" ? "Tailored CV" : "Tailored resume"}, ${d.created_at.slice(0, 10)}${d.edited ? " (edited)" : ""}` })),
                    ...(resume ? [{ value: `r:${resume.id}`, label: "Your current resume" }] : []),
                  ]}
                >
                  Apply on {source.kind === "aggregator" ? "the listing" : "the employer's site"} <ArrowUpRight aria-hidden />
                </ApplyLink>
              ) : (
                <div className="grid gap-1">
                  <span role="link" aria-disabled="true" className={cn(buttonVariants(), "pointer-events-none w-full opacity-50")}>
                    Apply unavailable
                  </span>
                  <p className="text-xs text-muted-foreground">{apply.reason}</p>
                </div>
              )}
              <div className="grid gap-1 border-t pt-3">
                <p className="text-xs font-medium text-muted-foreground">Source</p>
                <SourceTag source={source} />
                <dl className="grid gap-0.5 text-xs text-muted-foreground">
                  <div>
                    <dt className="inline">Retrieved: </dt>
                    <dd className="inline">{timeAgo(job.last_seen_at)}</dd>
                  </div>
                  {job.verified_at ? (
                    <div>
                      <dt className="inline">Link verified: </dt>
                      <dd className="inline">{timeAgo(job.verified_at)}</dd>
                    </div>
                  ) : null}
                  <div>
                    <dt className="inline">Listing id: </dt>
                    <dd className="inline break-all">{job.source === "manual" ? "pasted by you" : job.external_id}</dd>
                  </div>
                  {job.final_url && job.final_url !== job.apply_url ? (
                    <div>
                      <dt className="inline">Leads to: </dt>
                      <dd className="inline break-all">{new URL(job.final_url).hostname}</dd>
                    </div>
                  ) : null}
                  {alsoOn.length ? (
                    <div>
                      <dt className="inline">Also listed on: </dt>
                      <dd className="inline">{[...new Set(alsoOn.map((t) => alsoListedOn(t.source)))].join(", ")}</dd>
                    </div>
                  ) : null}
                </dl>
              </div>
              <div className="grid gap-1.5 border-t pt-3">
                <p className="text-xs font-medium text-muted-foreground">Your status</p>
                <StatusActions jobId={job.id} status={state?.status ?? null} />
                {application ? (
                  <Link href={`/applications/${application.id}`} className="text-sm text-primary hover:underline">
                    In Applications: {STAGE_LABEL[application.stage]}
                    {application.attempt > 1 ? ` (attempt ${application.attempt})` : ""}
                  </Link>
                ) : null}
              </div>
            </CardContent>
          </Card>
          {job.company ? (
            <Suspense fallback={null}>
              <PeopleAtCompany company={job.company} applicationId={application?.id ?? null} city={job.city} />
            </Suspense>
          ) : null}
        </aside>
      </div>
    </div>
  );
}

function FitExplanationLine({ e }: { e: ReturnType<typeof explainFit> }) {
  const parts = [
    e.strong.length ? `Strong matches: ${e.strong.slice(0, 6).join(", ")}` : null,
    e.missing.length ? `Missing: ${e.missing.slice(0, 4).join(", ")}` : null,
    e.preferredNotFound.length ? `Preferred requirement not found: ${e.preferredNotFound.slice(0, 3).join(", ")}` : null,
  ].filter(Boolean);
  return parts.length ? <p className="text-sm">{parts.join(" · ")}</p> : null;
}

function RequirementList({ title, items, resultFor }: { title: string; items: Requirement[]; resultFor: (r: Requirement) => RequirementResult | undefined }) {
  if (!items.length) return null;
  const met = items.filter((r) => resultFor(r)?.status === "met").length;
  return (
    <section className="grid content-start gap-2">
      <h3 className="flex items-baseline justify-between gap-2 text-sm font-semibold">
        {title}
        <span className="text-xs font-normal text-muted-foreground">
          {met} of {items.length} met
        </span>
      </h3>
      <ul className="grid gap-2">
        {items.map((req) => {
          const r = resultFor(req);
          const status = r?.status ?? "missing";
          const Icon = STATUS_ICON[status];
          return (
            <li key={req.id} className="grid grid-cols-[auto_1fr] gap-2.5 text-sm">
              <span className={cn("mt-0.5 flex size-5 items-center justify-center rounded-full", STATUS_TONE[status])}>
                <Icon aria-label={STATUS_TEXT[status]} className="size-3.5" />
              </span>
              <div className="grid gap-0.5">
                <p>{req.text}</p>
                {r?.quote ? <p className="text-xs text-muted-foreground">Your resume: “{r.quote}”</p> : null}
                {r?.note ? <p className="text-xs text-muted-foreground">{r.note}</p> : null}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** A short fingerprint of a string, to notice when generated content changes. */
function hash(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

type DocRow = {
  id: string;
  kind: "resume" | "cover_letter" | "cv";
  mode: "normal" | "apply_anyway";
  method: string;
  label: string | null;
  generated: unknown;
  edited: unknown;
  guard_report: unknown;
  comparison: unknown;
  created_at: string;
  updated_at: string;
};

const KIND_TITLE = { resume: "Tailored resume", cv: "Tailored CV", cover_letter: "Cover letter" } as const;

function DocCard({ doc, originals }: { doc: DocRow; originals: Record<string, string> }) {
  const issues = (Array.isArray(doc.guard_report) ? doc.guard_report : []) as GuardIssue[];
  const content = doc.edited ?? doc.generated;
  const isLetter = doc.kind === "cover_letter";
  const resume = !isLetter ? TailoredResumeDoc.safeParse(content) : null;
  const letter = isLetter ? CoverLetterDoc.safeParse(content) : null;
  const generatedResume = !isLetter ? TailoredResumeDoc.safeParse(doc.generated) : null;
  const generatedLetter = isLetter ? CoverLetterDoc.safeParse(doc.generated) : null;
  const comparison = doc.comparison as Comparison | null;
  // The editor starts over only when new documents are generated, not when edits are saved.
  const editorKey = `${doc.id}-${hash(JSON.stringify(doc.generated))}`;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2 text-lg">
          {doc.label ?? KIND_TITLE[doc.kind]}
          <Badge variant="outline">{DOC_METHOD_LABELS[doc.method as keyof typeof DOC_METHOD_LABELS] ?? doc.method}</Badge>
          {doc.mode === "apply_anyway" ? <Badge variant="outline">Applying anyway</Badge> : null}
          {doc.edited ? <Badge variant="secondary">Edited by you</Badge> : null}
        </CardTitle>
        <CardDescription>
          Made {timeAgo(doc.created_at)}.{" "}
          {doc.method === "template" ? "It's a template from your matched experience, not written by AI: make it sound like you before sending." : "Read it through and make it yours before sending."}
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        {comparison ? <ComparisonPanel c={comparison} /> : null}
        <GuardReport issues={issues} />
        {resume?.success && generatedResume?.success ? (
          <ResumeDocEditor key={editorKey} docId={doc.id} initial={resume.data} generated={generatedResume.data} edited={Boolean(doc.edited)} originals={originals} />
        ) : null}
        {letter?.success && generatedLetter?.success ? <LetterDocEditor key={editorKey} docId={doc.id} initial={letter.data} generated={generatedLetter.data} edited={Boolean(doc.edited)} /> : null}
        {resume?.success === false || letter?.success === false ? <p className="text-sm text-destructive">This document couldn&apos;t be read. Generate it again.</p> : null}
      </CardContent>
    </Card>
  );
}
