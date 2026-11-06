import { LocaleScope } from "@/components/locale-scope";
import { getT } from "@/lib/i18n/server";
import type { Translator } from "@/lib/i18n";
import { Suspense } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { PageSkeleton } from "@/components/page-skeleton";
import { PageHeaderT } from "@/components/tx";
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
import { log } from "@/lib/server/log";
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
      <PageHeaderT
        back={{ href: "/jobs", label: "pages.backJobs" }}
        title="pages.resume.title"
        description="pages.resume.description"
      />
      <Suspense fallback={<PageSkeleton labelKey="loading.generic" />}>
        <LocaleScope groups={["msg", "ui"]}>
          <ResumeContent searchParams={searchParams} />
        </LocaleScope>
      </Suspense>
    </div>
  );
}

async function ResumeContent({ searchParams }: { searchParams: PageProps<"/jobs/resume">["searchParams"] }) {
  const t = await getT();
  const params = await searchParams;
  const supabase = await createClient();
  const { data: resumes, error } = await supabase
    .from("resumes")
    .select("id, label, track, file_name, source_kind, original_file_path, raw_text, profile, original_profile, field_meta, facts, parsed_with, is_active, created_at, updated_at")
    .order("created_at", { ascending: false });
  if (error) {
    log("error", "resume-page", "load_failed", { code: error.code, message: error.message });
    return <LoadError what="your resumes" />;
  }
  const track = normalizeTrack(typeof params.track === "string" ? params.track : null);
  const trackNames = [...new Map(resumes.filter((r) => r.is_active).map((r) => [(r.track ?? "").toLowerCase(), r.track])).values()].sort((a, b) => Number(a !== null) - Number(b !== null) || (a ?? "").localeCompare(b ?? ""));
  const active = resumes.find((r) => r.is_active && sameTrack(r.track, track));
  const profile = active ? ResumeProfile.safeParse(active.profile) : null;
  if (active && profile && !profile.success) {
    log("error", "resume-page", "profile_invalid", { resumeId: active.id, issues: profile.error.issues.slice(0, 3).map((i) => `${i.path.join(".")}: ${i.code}`).join("; ") });
  }
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
            <ActionForm action={saveResumeFacts} submitLabel={t("msg.savec9cc")}>
              <input type="hidden" name="resumeId" value={active.id} />
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="grid gap-1.5">
                  <Label htmlFor="workAuthorization">{t("msg.workAuthorizationInThef6fe")}</Label>
                  <AppSelect id="workAuthorization" name="workAuthorization" defaultValue={facts.workAuthorization}>
                    {WORK_AUTHORIZATION.map((w) => (
                      <option key={w} value={w}>
                        {WORK_AUTH_LABELS[w]}
                      </option>
                    ))}
                  </AppSelect>
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="yearsOverride">{t("msg.yearsOfExperienceLeave3518")}</Label>
                  <Input id="yearsOverride" name="yearsOverride" type="number" min={0} max={50} step={0.5} defaultValue={facts.yearsOverride ?? ""} />
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox name="securityClearance" defaultChecked={facts.securityClearance} />I hold a government
                security clearance there (e.g. Canadian reliability status or higher)
              </label>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox name="willingToRelocate" defaultChecked={facts.willingToRelocate} />
                {t("msg.iMWillingTo3328")}
              </label>
            </ActionForm>
          }
        />
      ) : active ? (
        <LoadError what="this resume" />
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>{active ? t("msg.importANewVersionf6d8") : track ? `Import your ${track} resume` : t("msg.importYourResumed988")}</CardTitle>
          <CardDescription>{t("msg.uploadAPdfOr912a")}</CardDescription>
        </CardHeader>
        <CardContent>
          <ResumeUpload key={track ?? ""} hasResume={Boolean(active)} aiNote={aiNote} track={track} />
        </CardContent>
      </Card>

      {resumes.length > 1 || (resumes.length === 1 && !active) ? (
        <Card>
          <CardHeader>
            <CardTitle>{t("msg.allImportedResumes94f8")}</CardTitle>
            <CardDescription>{t("msg.eachImportIsKeptd111")}</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="grid gap-2">
              {resumes.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-card p-3">
                  <span className="text-sm">
                    {r.label} <span className="text-muted-foreground">· {trackLabel(r.track)} · {SOURCE_LABELS[r.source_kind as keyof typeof SOURCE_LABELS] ?? "PDF"} · {timeAgo(r.created_at)}</span>{" "}
                    {r.is_active ? <Badge>{t("msg.inUsefb13")}</Badge> : null}
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
  const t = await getT();
  const meta = FieldMetaMap.catch({}).parse(active.field_meta);
  const summary = importSummary(profile, meta);
  const showSummary = justImported || summary.needsReview.length > 0;
  const degree = highestDegree(profile);
  const versions = await loadVersions(active, profile, t);
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
          <CardTitle>{t("msg.whatYourResumeShows6186")}</CardTitle>
          <CardDescription>
            {active.label} · {SOURCE_LABELS[active.source_kind as keyof typeof SOURCE_LABELS] ?? "PDF"} · imported {timeAgo(active.created_at)} · read{" "}
            {active.parsed_with === "ai" ? "with rules and a second AI read" : "with rules, without AI"}
          </CardDescription>
          <div className="flex flex-wrap gap-2 pt-1">
            <a href={`/api/jobs/resume/${active.id}/download?format=pdf`} className={buttonVariants({ variant: "outline", size: "sm" })}>
              {t("msg.downloadPdf2607")}
            </a>
            <a href={`/api/jobs/resume/${active.id}/download?format=docx`} className={buttonVariants({ variant: "outline", size: "sm" })}>
              {t("msg.downloadWorde9ba")}
            </a>
          </div>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Badge variant="secondary">About {yearsOfExperience(profile)} years of work experience</Badge>
          <Badge variant="secondary">{degree ? `${DEGREE_LABELS[degree]} level` : t("msg.degreeLevelNotRecognisede99a")}</Badge>
          <Badge variant="secondary">{profile.skills.length} skills</Badge>
          <Badge variant="secondary">{profile.experience.length} jobs</Badge>
          <Badge variant="secondary">{profile.projects.length} projects</Badge>
          <Badge variant="secondary">Profile {summary.completeness}% complete</Badge>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("msg.yourSituation3f2c")}</CardTitle>
          <CardDescription>{t("msg.usedOnlyToCheck5b8a")}</CardDescription>
        </CardHeader>
        <CardContent>{factsForm}</CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("msg.checkYourProfile91ef")}</CardTitle>
          <CardDescription>{t("msg.fixOrConfirmAnything31ed")}</CardDescription>
        </CardHeader>
        <CardContent>
          <ProfileEditor key={`${active.id}-${active.updated_at}`} resumeId={active.id} initial={profile} meta={meta} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("msg.versions9e69")}</CardTitle>
          <CardDescription>{t("msg.yourOriginalCurrentProfilea866")}</CardDescription>
        </CardHeader>
        <CardContent>
          <ResumeVersions resumeId={active.id} versions={versions} canRestore={original.success} />
        </CardContent>
      </Card>
    </>
  );
}

async function loadVersions(active: ResumeRow, profile: ResumeProfile, t: Translator): Promise<Version[]> {
  const original = ResumeProfile.safeParse(active.original_profile);
  const versions: Version[] = [
    {
      key: "original",
      kind: "original",
      label: t("msg.originalResume2461"),
      detail: `${SOURCE_LABELS[active.source_kind as keyof typeof SOURCE_LABELS] ?? "PDF"} as imported ${timeAgo(active.created_at)}${active.original_file_path ? "" : " (text only)"}`,
      text: active.raw_text,
      download: `/api/jobs/resume/${active.id}/original`,
    },
  ];
  if (active.original_profile && original.success) {
    versions.push({ key: "parsed", kind: "parsed", label: t("msg.parsedResume992b"), detail: t("msg.asFirstReadBefore7753"), text: profileText(original.data) });
  }
  versions.push({ key: "current", kind: "current", label: t("msg.currentProfilec3db"), detail: `Your working profile, used for fit checks · updated ${timeAgo(active.updated_at)}`, text: profileText(profile) });

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
async function TrackNav({ tracks, current }: { tracks: (string | null)[]; current: string | null }) {
  const t = await getT();
  if (tracks.length === 0) return null;
  const href = (t: string | null) => (t ? `/jobs/resume?track=${encodeURIComponent(t)}` : "/jobs/resume");
  return (
    <nav aria-label={t("msg.resumeTracksd0d1")} className="flex flex-wrap items-center gap-2">
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
      <span className="text-xs text-muted-foreground">{t("msg.toAddATrackab89")}</span>
    </nav>
  );
}
