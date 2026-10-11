import { Suspense } from "react";
import { PageHeader } from "@/components/page-header";
import { ActionForm } from "@/components/action-form";
import { LoadError } from "@/components/load-error";
import { NativeSelect } from "@/components/native-select";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { WORK_AUTH_LABELS, timeAgo } from "@/lib/job-postings/labels";
import { highestDegree, yearsOfExperience } from "@/lib/job-postings/resume";
import { ResumeFacts, ResumeProfile, WORK_AUTHORIZATION } from "@/lib/job-postings/types";
import { createClient } from "@/lib/supabase/server";
import { saveResumeFacts } from "../actions";
import { ProfileEditor, ResumeListActions } from "./profile-editor";
import { ResumeUpload } from "./upload-form";

export const metadata = { title: "Resume · Jobs · Network Growth" };
// Reading a PDF and structuring it with AI can take a while.
export const maxDuration = 60;

const DEGREE_LABELS = { diploma: "Diploma", bachelor: "Bachelor's", master: "Master's", phd: "PhD" } as const;

export default function ResumePage() {
  return (
    <div className="grid gap-6">
      <PageHeader
        back={{ href: "/jobs", label: "Jobs" }}
        title="Your resume"
        description="Postings are checked against this resume, and tailored resumes and cover letters can only use what it says. Check that it was read correctly. It stays in your account, and is sent to Anthropic only if you choose “Rewrite with AI”."
      />
      <Suspense fallback={<p className="text-sm text-muted-foreground">Loading…</p>}>
        <ResumeContent />
      </Suspense>
    </div>
  );
}

async function ResumeContent() {
  const supabase = await createClient();
  const { data: resumes, error } = await supabase.from("resumes").select("id, label, file_name, profile, facts, parsed_with, is_active, created_at, updated_at").order("created_at", { ascending: false });
  if (error) return <LoadError what="your resumes" />;
  const active = resumes.find((r) => r.is_active);
  const profile = active ? ResumeProfile.safeParse(active.profile) : null;
  const facts = ResumeFacts.parse(active?.facts ?? {});

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>{active ? "Replace or update" : "Upload your resume"}</CardTitle>
        </CardHeader>
        <CardContent>
          <ResumeUpload hasResume={Boolean(active)} />
        </CardContent>
      </Card>

      {active && profile?.success ? (
        <>
          <Card>
            <CardHeader>
              <CardTitle>What your resume shows</CardTitle>
              <CardDescription>
                {active.label} · uploaded {timeAgo(active.created_at)} · read {active.parsed_with === "ai" ? "with AI" : "without AI"}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              <Badge variant="secondary">About {yearsOfExperience(profile.data)} years of work experience</Badge>
              <Badge variant="secondary">{highestDegree(profile.data) ? `${DEGREE_LABELS[highestDegree(profile.data)!]} level` : "Degree level not recognised"}</Badge>
              <Badge variant="secondary">{profile.data.skills.length} skills</Badge>
              <Badge variant="secondary">{profile.data.experience.length} jobs</Badge>
              <Badge variant="secondary">{profile.data.projects.length} projects</Badge>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Your situation</CardTitle>
              <CardDescription>Resumes usually don&apos;t say these, but postings often require them. They&apos;re used only to check fit.</CardDescription>
            </CardHeader>
            <CardContent>
              <ActionForm action={saveResumeFacts} submitLabel="Save">
                <input type="hidden" name="resumeId" value={active.id} />
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="grid gap-1.5">
                    <Label htmlFor="workAuthorization">Work authorization in Canada</Label>
                    <NativeSelect id="workAuthorization" name="workAuthorization" defaultValue={facts.workAuthorization}>
                      {WORK_AUTHORIZATION.map((w) => (
                        <option key={w} value={w}>
                          {WORK_AUTH_LABELS[w]}
                        </option>
                      ))}
                    </NativeSelect>
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor="yearsOverride">Years of experience (leave blank to count from your dates)</Label>
                    <Input id="yearsOverride" name="yearsOverride" type="number" min={0} max={50} step={0.5} defaultValue={facts.yearsOverride ?? ""} />
                  </div>
                </div>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="securityClearance" defaultChecked={facts.securityClearance} className="size-4 accent-primary" />I hold a
                  Canadian security clearance (reliability status or higher)
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="willingToRelocate" defaultChecked={facts.willingToRelocate} className="size-4 accent-primary" />
                  I&apos;m willing to relocate
                </label>
              </ActionForm>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Check what was read</CardTitle>
              <CardDescription>Fix anything that was read wrong. Saving changes the resume used for fit checks and tailoring.</CardDescription>
            </CardHeader>
            <CardContent>
              <ProfileEditor key={`${active.id}-${active.updated_at}`} resumeId={active.id} initial={profile.data} />
            </CardContent>
          </Card>
        </>
      ) : active ? (
        <LoadError what="this resume" />
      ) : null}

      {resumes.length > 1 || (resumes.length === 1 && !active) ? (
        <Card>
          <CardHeader>
            <CardTitle>All resumes</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="grid gap-2">
              {resumes.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-card p-3">
                  <span className="text-sm">
                    {r.label} <span className="text-muted-foreground">· {timeAgo(r.created_at)}</span> {r.is_active ? <Badge>In use</Badge> : null}
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
