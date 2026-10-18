import { Suspense } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { PageSkeleton } from "@/components/page-skeleton";
import { PageHeader } from "@/components/page-header";
import { ActionForm } from "@/components/action-form";
import { LoadError } from "@/components/load-error";
import { AppSelect } from "@/components/app-select";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { aiAccess } from "@/lib/job-postings/ai";
import { TailoredResumeDoc } from "@/lib/job-postings/documents";
import { DOC_METHOD_LABELS, WORK_AUTH_LABELS, timeAgo } from "@/lib/job-postings/labels";
import { profileText } from "@/lib/job-postings/profile-text";
import { blocksToText, resumeBlocks } from "@/lib/job-postings/render/layout";
import { highestDegree, yearsOfExperience } from "@/lib/job-postings/resume";
import { completenessChecks, fieldLabel, importSummary } from "@/lib/job-postings/resume-fields";
import { FieldMetaMap, ResumeFacts, ResumeProfile, WORK_AUTHORIZATION } from "@/lib/job-postings/types";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { MAIN_TRACK_LABEL, normalizeTrack, sameTrack, trackLabel } from "@/lib/job-postings/tracks";
import { cn } from "@/lib/utils";
import { saveResumeFacts } from "./actions";
import { ImportSummary } from "./import-summary";
import { ProfileEditor, ResumeListActions } from "./profile-editor";
import { ResumeUpload } from "./upload-form";
import { ResumeVersions, type Version } from "./versions";

export const metadata = { title: "Resume · Jobs · Network Growth" };
// Reading a file (and an optional AI read) can take a while.
export const maxDuration = 60;

const DEGREE_LABELS = { diploma: "Diploma", bachelor: "Bachelor's", master: "Master's", phd: "PhD" } as const;
const SOURCE_LABELS = { pdf: "PDF", docx: "Word document", paste: "Pasted text" } as const;

export default function ResumePage({ searchParams }: PageProps<"/jobs/resume">) {
  return (
    <div className="grid gap-6">
      <PageHeader
        back={{ href: "/jobs", label: "Jobs" }}
        title="Your resume"
        description="Postings are checked against this profile. Review what was read; anything uncertain is marked."
      />
      <Suspense fallback={<PageSkeleton label="Loading…" />}>
        <ResumeContent searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function ResumeContent({ searchParams }: { searchParams: PageProps<"/jobs/resume">["searchParams"] }) {
  const params = await searchParams;
  const supabase = await createClient();
  const { data: resumes, error } = await supabase
    .from("resumes")
    .select("id, label, track, file_name, source_kind, original_file_path, raw_text, profile, original_profile, field_meta, facts, parsed_with, is_active, created_at, updated_at")
    .order("created_at", { ascending: false });
  if (error) return <LoadError what="your resumes" />;
  const track = normalizeTrack(typeof params.track === "string" ? params.track : null);
  const trackNames = [...new Map(resumes.filter((r) => r.is_active).map((r) => [(r.track ?? "").toLowerCase(), r.track])).values()].sort((a, b) => Number(a !== null) - Number(b !== null) || (a ?? "").localeCompare(b ?? ""));
  const active = resumes.find((r) => r.is_active && sameTrack(r.track, track));
  const profile = active ? ResumeProfile.safeParse(active.profile) : null;
  const facts = ResumeFacts.parse(active?.facts ?? {});
  const access = await aiAccess(supabase);
  const aiNote = access.ok
    ? { available: true, text: access.source === "own" ? "uses your own AI key" : access.remaining === null ? "uses the app's AI" : `uses 1 of your ${access.remaining} free AI uses today` }
    : { available: false, text: access.reason };

  return (
    <>
      <TrackNav tracks={trackNames} current={track} />
      {active && profile?.success ? (
        <ActiveResume
          active={active}
          profile={profile.data}
          justImported={params.imported === active.id}
          factsForm={
            <ActionForm action={saveResumeFacts} submitLabel="Save">
              <input type="hidden" name="resumeId" value={active.id} />
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="grid gap-1.5">
                  <Label htmlFor="workAuthorization">Work authorization in the country you search</Label>
                  <AppSelect id="workAuthorization" name="workAuthorization" defaultValue={facts.workAuthorization}>
                    {WORK_AUTHORIZATION.map((w) => (
                      <option key={w} value={w}>
                        {WORK_AUTH_LABELS[w]}
                      </option>
                    ))}
                  </AppSelect>
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="yearsOverride">Years of experience (leave blank to count from your dates)</Label>
                  <Input id="yearsOverride" name="yearsOverride" type="number" min={0} max={50} step={0.5} defaultValue={facts.yearsOverride ?? ""} />
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox name="securityClearance" defaultChecked={facts.securityClearance} />I hold a government
                security clearance there (e.g. Canadian reliability status or higher)
              </label>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox name="willingToRelocate" defaultChecked={facts.willingToRelocate} />
                I&apos;m willing to relocate
              </label>
            </ActionForm>
          }
        />
      ) : active ? (
        <LoadError what="this resume" />
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>{active ? "Import a new version" : track ? `Import your ${track} resume` : "Import your resume"}</CardTitle>
          <CardDescription>Upload a PDF or Word file, or paste the text. We fill in your profile and mark anything we weren&apos;t sure about.</CardDescription>
        </CardHeader>
        <CardContent>
          <ResumeUpload key={track ?? ""} hasResume={Boolean(active)} aiNote={aiNote} track={track} />
        </CardContent>
      </Card>

      {resumes.length > 1 || (resumes.length === 1 && !active) ? (
        <Card>
          <CardHeader>
            <CardTitle>All imported resumes</CardTitle>
            <CardDescription>Each import is kept separately. One is used for fit checks and tailoring at a time.</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="grid gap-2">
              {resumes.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-card p-3">
                  <span className="text-sm">
                    {r.label} <span className="text-muted-foreground">· {trackLabel(r.track)} · {SOURCE_LABELS[r.source_kind as keyof typeof SOURCE_LABELS] ?? "PDF"} · {timeAgo(r.created_at)}</span>{" "}
                    {r.is_active ? <Badge>In use</Badge> : null}
                  </span>
                  <ResumeListActions id={r.id} active={r.is_active} />
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : active ? (
        <div>
          <ResumeListActions id={active.id} active />
        </div>
      ) : null}
    </>
  );
}

type ResumeRow = {
  id: string;
  label: string;
  source_kind: string;
  original_file_path: string | null;
  raw_text: string;
  original_profile: unknown;
  field_meta: unknown;
  parsed_with: string;
  created_at: string;
  updated_at: string;
};

async function ActiveResume({ active, profile, justImported, factsForm }: { active: ResumeRow; profile: ResumeProfile; justImported: boolean; factsForm: React.ReactNode }) {
  const meta = FieldMetaMap.catch({}).parse(active.field_meta);
  const summary = importSummary(profile, meta);
  const showSummary = justImported || summary.needsReview.length > 0;
  const degree = highestDegree(profile);
  const versions = await loadVersions(active, profile);
  const original = ResumeProfile.safeParse(active.original_profile);

  return (
    <>
      {showSummary ? (
        <ImportSummary
          justImported={justImported}
          filled={summary.filled}
          completeness={summary.completeness}
          missingChecks={completenessChecks(profile)
            .filter((c) => !c.done)
            .map((c) => c.label.toLowerCase())}
          needsReview={summary.needsReview.map((path) => ({ path, label: fieldLabel(path, profile), reason: meta[path]?.reason }))}
          missing={summary.missing.map((path) => ({ path, label: fieldLabel(path, profile), reason: meta[path]?.reason }))}
        />
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>What your resume shows</CardTitle>
          <CardDescription>
            {active.label} · {SOURCE_LABELS[active.source_kind as keyof typeof SOURCE_LABELS] ?? "PDF"} · imported {timeAgo(active.created_at)} · read{" "}
            {active.parsed_with === "ai" ? "with rules and a second AI read" : "with rules, without AI"}
          </CardDescription>
          <div className="flex flex-wrap gap-2 pt-1">
            <a href={`/api/jobs/resume/${active.id}/download?format=pdf`} className={buttonVariants({ variant: "outline", size: "sm" })}>
              Download PDF
            </a>
            <a href={`/api/jobs/resume/${active.id}/download?format=docx`} className={buttonVariants({ variant: "outline", size: "sm" })}>
              Download Word
            </a>
          </div>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Badge variant="secondary">About {yearsOfExperience(profile)} years of work experience</Badge>
          <Badge variant="secondary">{degree ? `${DEGREE_LABELS[degree]} level` : "Degree level not recognised"}</Badge>
          <Badge variant="secondary">{profile.skills.length} skills</Badge>
          <Badge variant="secondary">{profile.experience.length} jobs</Badge>
          <Badge variant="secondary">{profile.projects.length} projects</Badge>
          <Badge variant="secondary">Profile {summary.completeness}% complete</Badge>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Your situation</CardTitle>
          <CardDescription>Resumes usually don&apos;t say these, but postings often require them. They&apos;re used only to check fit.</CardDescription>
        </CardHeader>
        <CardContent>{factsForm}</CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Check your profile</CardTitle>
          <CardDescription>Fields marked “Needs review” were hard to read; fix them or confirm they&apos;re right. Saving changes your working profile, never the original.</CardDescription>
        </CardHeader>
        <CardContent>
          <ProfileEditor key={`${active.id}-${active.updated_at}`} resumeId={active.id} initial={profile} meta={meta} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Versions</CardTitle>
          <CardDescription>Your original resume, what was read from it, your current profile, and every tailored version. Compare any two.</CardDescription>
        </CardHeader>
        <CardContent>
          <ResumeVersions resumeId={active.id} versions={versions} canRestore={original.success} />
        </CardContent>
      </Card>
    </>
  );
}

async function loadVersions(active: ResumeRow, profile: ResumeProfile): Promise<Version[]> {
  const original = ResumeProfile.safeParse(active.original_profile);
  const versions: Version[] = [
    {
      key: "original",
      kind: "original",
      label: "Original resume",
      detail: `${SOURCE_LABELS[active.source_kind as keyof typeof SOURCE_LABELS] ?? "PDF"} as imported ${timeAgo(active.created_at)}${active.original_file_path ? "" : " (text only)"}`,
      text: active.raw_text,
      download: `/api/jobs/resume/${active.id}/original`,
    },
  ];
  if (active.original_profile && original.success) {
    versions.push({ key: "parsed", kind: "parsed", label: "Parsed resume", detail: "As first read, before your edits", text: profileText(original.data) });
  }
  versions.push({ key: "current", kind: "current", label: "Current profile", detail: `Your working profile, used for fit checks · updated ${timeAgo(active.updated_at)}`, text: profileText(profile) });

  const supabase = await createClient();
  const { data: matches } = await supabase.from("job_matches").select("id, job_id").eq("resume_id", active.id);
  if (!matches?.length) return versions;
  const { data: docs } = await supabase
    .from("tailored_documents")
    .select("id, kind, label, method, generated, edited, match_id, created_at")
    .in(
      "match_id",
      matches.map((m) => m.id),
    )
    .in("kind", ["resume", "cv"])
    .is("deleted_at", null)
    .order("created_at", { ascending: false });
  const jobIds = [...new Set(matches.map((m) => m.job_id))];
  const { data: jobs } = await supabase.from("jobs").select("id, title, company").in("id", jobIds);
  const jobOf = new Map(matches.map((m) => [m.id, jobs?.find((j) => j.id === m.job_id)]));
  for (const d of docs ?? []) {
    const parsed = TailoredResumeDoc.safeParse(d.edited ?? d.generated);
    if (!parsed.success) continue;
    const job = jobOf.get(d.match_id);
    const what = d.kind === "cv" ? "CV" : "Resume";
    versions.push({
      key: d.id,
      kind: "tailored",
      docId: d.id,
      label: d.label ?? `Tailored ${what} — ${[job?.company, job?.title].filter(Boolean).join(" / ") || "a job"}`,
      detail: `${DOC_METHOD_LABELS[d.method as keyof typeof DOC_METHOD_LABELS] ?? d.method} · ${timeAgo(d.created_at)}${d.edited ? " · edited by you" : ""}`,
      text: blocksToText(resumeBlocks(parsed.data)),
      href: job ? `/jobs/${job.id}#documents` : undefined,
    });
  }
  return versions;
}

/** The resume tracks you keep, plus a way to start a new one. Each track has its own current resume. */
function TrackNav({ tracks, current }: { tracks: (string | null)[]; current: string | null }) {
  if (tracks.length === 0) return null;
  const href = (t: string | null) => (t ? `/jobs/resume?track=${encodeURIComponent(t)}` : "/jobs/resume");
  return (
    <nav aria-label="Resume tracks" className="flex flex-wrap items-center gap-2">
      {tracks.map((t) => (
        <Link
          key={t ?? "main"}
          href={href(t)}
          aria-current={sameTrack(t, current) ? "page" : undefined}
          className={cn("rounded-full border bg-card px-3 py-1.5 text-sm transition-colors hover:border-primary/40", sameTrack(t, current) && "border-primary bg-accent font-medium text-accent-foreground")}
        >
          {t ?? MAIN_TRACK_LABEL}
        </Link>
      ))}
      <span className="text-xs text-muted-foreground">To add a track, import a resume with a new track name below.</span>
    </nav>
  );
}
