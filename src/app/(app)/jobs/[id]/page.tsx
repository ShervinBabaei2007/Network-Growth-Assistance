import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowUpRight, Building2, Check, Clock, MapPin, Minus, Telescope, X } from "lucide-react";
import { FitScore, SourceTag, TIER_STYLE } from "@/components/jobs/job-visuals";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { aiAccess } from "@/lib/job-postings/ai";
import { CoverLetterDoc, TailoredResumeDoc, type GuardIssue } from "@/lib/job-postings/documents";
import { placeLabel, timeAgo } from "@/lib/job-postings/labels";
import { StoredFit } from "@/lib/job-postings/schemas";
import { loadActiveResume, scoreJobs } from "@/lib/job-postings/service";
import { jobServices } from "@/lib/job-postings/services";
import { jobSource } from "@/lib/job-postings/source";
import type { Requirement, RequirementResult } from "@/lib/job-postings/types";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";
import { GuardReport, LetterDocEditor, ResumeDocEditor } from "./document-editor";
import { CheckFitButton, StatusActions, TailorButtons } from "./posting-actions";

export const metadata = { title: "Job · Jobs · Network Growth" };
// AI rewording (optional) makes two model calls in parallel, each with one retry.
export const maxDuration = 60;

export default function JobPage({ params }: PageProps<"/jobs/[id]">) {
  return (
    <Suspense fallback={<p className="text-sm text-muted-foreground">Loading…</p>}>
      <Job params={params} />
    </Suspense>
  );
}

const STATUS_ICON = { met: Check, partial: Minus, missing: X } as const;
const STATUS_TEXT = { met: "Met", partial: "Partly met", missing: "Not shown" } as const;
const STATUS_TONE = { met: "bg-success-soft text-success", partial: "bg-warning-soft text-warning", missing: "bg-danger-soft text-destructive" } as const;

async function Job({ params }: Pick<PageProps<"/jobs/[id]">, "params">) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims.sub;
  const [{ data: job }, resume, { data: state }, ai] = await Promise.all([
    supabase.from("jobs").select("*").eq("id", id).maybeSingle(),
    loadActiveResume(supabase),
    supabase.from("job_user_states").select("status").eq("job_id", id).maybeSingle(),
    aiAccess(supabase),
  ]);
  if (!job || !userId) notFound();
  const { data: employer } = job.employer_id ? await supabase.from("employers").select("name, ats").eq("id", job.employer_id).maybeSingle() : { data: null };

  let { data: match } = resume ? await supabase.from("job_matches").select("*").eq("job_id", id).eq("resume_id", resume.id).maybeSingle() : { data: null };
  // Check (or recheck after a resume change) right away: rules and database queries, no outside calls.
  if (resume && (!match || Date.parse(match.updated_at) < Date.parse(resume.updatedAt))) {
    await scoreJobs(supabase, userId, resume, [id], jobServices().embedder);
    ({ data: match } = await supabase.from("job_matches").select("*").eq("job_id", id).eq("resume_id", resume.id).maybeSingle());
  }
  const { data: docs } = match ? await supabase.from("tailored_documents").select("id, kind, mode, method, generated, edited, guard_report, updated_at").eq("match_id", match.id) : { data: [] };
  const fit = match ? StoredFit.safeParse(match.requirement_results) : null;
  const originals: Record<string, string> = {};
  if (resume) for (const e of [...resume.profile.experience, ...resume.profile.projects, ...resume.profile.education]) for (const b of e.bullets) originals[b.id] = b.text;
  const resumeDoc = docs?.find((d) => d.kind === "resume");
  const letterDoc = docs?.find((d) => d.kind === "cover_letter");
  const discoverQuery = job.company ? `Find people working at ${job.company}${job.city ? ` in ${job.city}` : ""}` : null;
  const aiNote = ai.ok ? (ai.source === "own" ? "AI rewording uses your own key." : `AI rewording: ${ai.remaining} left today.`) : ai.reason;
  const source = jobSource(job, employer);
  const results = fit?.success ? fit.data.results : [];
  const requirements = fit?.success ? fit.data.requirements : [];
  const resultFor = (r: Requirement) => results.find((x) => x.requirementId === r.id);

  return (
    <div className="grid gap-6">
      <PageHeader
        back={{ href: "/jobs", label: "Jobs" }}
        title={job.title}
        meta={
          <span className="flex flex-wrap items-center gap-x-4 gap-y-1">
            {job.company ? (
              <span className="inline-flex items-center gap-1 font-medium text-foreground">
                <Building2 aria-hidden className="size-4 text-muted-foreground" />
                {job.company}
              </span>
            ) : null}
            <span className="inline-flex items-center gap-1">
              <MapPin aria-hidden className="size-4" />
              {placeLabel(job)}
            </span>
            <span className="inline-flex items-center gap-1">
              <Clock aria-hidden className="size-4" />
              {job.user_id ? "added by you" : `posted ${timeAgo(job.posted_at)}`}
            </span>
            {job.salary ? <span>{job.salary}</span> : null}
            {job.employment_type ? <span>{job.employment_type}</span> : null}
            {job.closed_at ? <Badge variant="outline">No longer listed</Badge> : null}
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
                  authorization are decided by rules.
                </CardDescription>
              ) : null}
            </CardHeader>
            <CardContent className="grid gap-5">
              {!resume ? (
                <p className="text-sm">
                  <Link href="/jobs/resume" className="font-medium text-primary underline underline-offset-4">
                    Upload your resume
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
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Tailored resume and cover letter</CardTitle>
                <CardDescription>Built only from what your resume says. Edit them, then download PDF or Word.</CardDescription>
              </CardHeader>
              <CardContent>
                <TailorButtons jobId={job.id} excluded={match.tier === "excluded"} hasDocs={Boolean(docs?.length)} ai={{ available: ai.ok, note: aiNote }} />
              </CardContent>
            </Card>
          ) : null}

          {resumeDoc ? <DocCard title="Tailored resume" doc={resumeDoc} originals={originals} /> : null}
          {letterDoc ? <DocCard title="Cover letter" doc={letterDoc} originals={originals} /> : null}

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">The posting</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="max-h-[36rem] max-w-prose overflow-y-auto text-sm leading-relaxed whitespace-pre-line">{job.description || "The employer's board didn't include a description. Open the posting for details."}</div>
            </CardContent>
          </Card>
        </div>

        {/* Actions: always in reach, beside the content on wide screens. */}
        <aside className="grid gap-4 lg:sticky lg:top-6" aria-label="Apply and track">
          <Card size="sm">
            <CardContent className="grid gap-3">
              <a href={job.apply_url} target="_blank" rel="noopener noreferrer" className={cn(buttonVariants(), "w-full")}>
                Apply on the employer&apos;s site <ArrowUpRight aria-hidden />
              </a>
              <div className="grid gap-1">
                <p className="text-xs font-medium text-muted-foreground">Source</p>
                <SourceTag source={source} />
              </div>
              <div className="grid gap-1.5 border-t pt-3">
                <p className="text-xs font-medium text-muted-foreground">Your status</p>
                <StatusActions jobId={job.id} status={state?.status ?? null} />
              </div>
              {discoverQuery ? (
                <Link href={`/discover?q=${encodeURIComponent(discoverQuery)}`} className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "justify-start border-t pt-3")}>
                  <Telescope aria-hidden /> Find people at {job.company}
                </Link>
              ) : null}
            </CardContent>
          </Card>
        </aside>
      </div>
    </div>
  );
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

type DocRow = { id: string; kind: "resume" | "cover_letter"; mode: "normal" | "apply_anyway"; method: string; generated: unknown; edited: unknown; guard_report: unknown; updated_at: string };

function DocCard({ title, doc, originals }: { title: string; doc: DocRow; originals: Record<string, string> }) {
  const issues = (Array.isArray(doc.guard_report) ? doc.guard_report : []) as GuardIssue[];
  const content = doc.edited ?? doc.generated;
  const resume = doc.kind === "resume" ? TailoredResumeDoc.safeParse(content) : null;
  const letter = doc.kind === "cover_letter" ? CoverLetterDoc.safeParse(content) : null;
  const generatedResume = doc.kind === "resume" ? TailoredResumeDoc.safeParse(doc.generated) : null;
  const generatedLetter = doc.kind === "cover_letter" ? CoverLetterDoc.safeParse(doc.generated) : null;
  // The editor starts over only when new documents are generated, not when edits are saved,
  // so the "Saved" confirmation and the text being edited stay put.
  const editorKey = `${doc.id}-${hash(JSON.stringify(doc.generated))}`;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2 text-lg">
          {title}
          <Badge variant="outline">{doc.method === "ai" ? "Reworded with AI" : "Free tailoring"}</Badge>
          {doc.mode === "apply_anyway" ? <Badge variant="outline">Applying anyway</Badge> : null}
          {doc.edited ? <Badge variant="secondary">Edited by you</Badge> : null}
        </CardTitle>
        <CardDescription>
          Made {timeAgo(doc.updated_at)}.{" "}
          {doc.kind === "cover_letter" && doc.method !== "ai" ? "It's a template from your matched experience: make it sound like you before sending." : "Read it through and make it yours before sending."}
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <GuardReport issues={issues} />
        {resume?.success && generatedResume?.success ? (
          <ResumeDocEditor key={editorKey} docId={doc.id} initial={resume.data} generated={generatedResume.data} edited={Boolean(doc.edited)} originals={originals} />
        ) : null}
        {letter?.success && generatedLetter?.success ? <LetterDocEditor key={editorKey} docId={doc.id} initial={letter.data} generated={generatedLetter.data} edited={Boolean(doc.edited)} /> : null}
        {resume?.success === false || letter?.success === false ? <p className="text-sm text-destructive">This document couldn&apos;t be read. Tailor it again.</p> : null}
      </CardContent>
    </Card>
  );
}
