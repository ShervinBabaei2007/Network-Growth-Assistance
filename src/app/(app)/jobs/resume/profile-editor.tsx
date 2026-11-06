"use client";

import { useTr } from "@/lib/i18n/client";
import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "@/components/toast/notify";
import { useActionRunner } from "@/components/toast/use-action-runner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useProtectedState } from "@/hooks/use-protected-state";
import { draftKey } from "@/lib/drafts";
import { getAt, setAt } from "@/lib/job-postings/resume-paths";
import { groupSkills, projectTechnologies, SKILL_GROUP_LABELS, type SkillGroup } from "@/lib/job-postings/skill-groups";
import type { FieldMetaMap, ResumeEntry, ResumeProfile } from "@/lib/job-postings/types";
import { cn } from "@/lib/utils";
import { confirmResumeField, deleteResume, saveResumeProfile, setActiveResume } from "./actions";
import { FieldShell, fieldAnchor } from "./field-status";

type EntryKey = "experience" | "projects" | "education" | "awards" | "activities";
type SectionConfig = { key: EntryKey; label: string; one: string; org: string; title: string; education?: boolean; dates: "range" | "single" };
type Tr = ReturnType<typeof useTr>;
const sectionsOf = (tr: Tr): SectionConfig[] => [
  { key: "experience", label: tr("msg.workExperiencedad9", "Work experience"), one: tr("msg.experience4038", "Experience"), org: tr("msg.employer96e4", "Employer"), title: tr("msg.jobTitlef4a7", "Job title"), dates: "range" },
  { key: "education", label: tr("msg.educationde7a", "Education"), one: tr("msg.educationde7a", "Education"), org: tr("msg.school955c", "School"), title: tr("msg.credentialLineAsWrittena5d5", "Credential line (as written)"), education: true, dates: "range" },
  { key: "projects", label: tr("msg.projects54e1", "Projects"), one: tr("msg.project9e72", "Project"), org: tr("msg.projectName7ade", "Project name"), title: tr("msg.roleOrTechLine1dc7", "Role or tech line (optional)"), dates: "range" },
  { key: "awards", label: tr("msg.awardsf66c", "Awards"), one: tr("msg.award4557", "Award"), org: tr("msg.award4557", "Award"), title: tr("msg.givenByOptional3fc0", "Given by (optional)"), dates: "single" },
  { key: "activities", label: tr("msg.extracurricularActivities0939", "Extracurricular activities"), one: tr("msg.activityecfc", "Activity"), org: tr("msg.organizationOrClub5e2c", "Organization or club"), title: tr("msg.rolebbba", "Role"), dates: "range" },
];

const blankEntry = (): ResumeEntry => ({ id: "", organization: "", title: null, start: null, end: null, location: null, bullets: [], degree: null, major: null, graduation: null });
const lines = (s: string) => s.split("\n").map((l) => l.trim()).filter(Boolean);
const nul = (s: string) => (s.trim() ? s : null);

const contactOf = (tr: Tr): [path: string, label: string, placeholder?: string][] => [
  ["name", tr("msg.fullNamef11b", "Full name")],
  ["email", tr("msg.emailBase", "Email")],
  ["phone", tr("msg.phoneNumber1f82", "Phone number")],
  ["location", tr("msg.locationce5b", "Location"), "Vancouver, BC"],
  ["contact.linkedin", tr("msg.linkedinUrled90", "LinkedIn URL"), "linkedin.com/in/…"],
  ["contact.github", tr("msg.githubUrl3aa3", "GitHub URL"), "github.com/…"],
  ["contact.website", tr("msg.portfolioWebsite75df", "Portfolio website"), "yourname.dev"],
];

/**
 * Checks and corrects what was read from the resume. Fields the parser wasn't sure about
 * are marked until changed or confirmed; fields it couldn't find say so. Whatever is saved
 * here is the profile used for fit checks and tailoring. The original resume never changes.
 */
export function ProfileEditor({ resumeId, initial, meta: initialMeta }: { resumeId: string; initial: ResumeProfile; meta: FieldMetaMap }) {
  const tr = useTr();
  const [p, setP] = useState(initial);
  const [meta, setMeta] = useState(initialMeta);
  const { pending, run } = useActionRunner();
  const confirmRunner = useActionRunner();
  const draftBanner = useProtectedState<ResumeProfile>(draftKey("resume-profile", resumeId), p, initial, setP, (d): d is ResumeProfile => typeof d === "object" && d !== null && Array.isArray((d as ResumeProfile).skills) && Array.isArray((d as ResumeProfile).experience));

  const edited = (path: string) => getAt(p, path) !== getAt(initial, path);
  const confirm = (path: string) =>
    confirmRunner.run(() => confirmResumeField(resumeId, path), { onSuccess: () => setMeta((m) => ({ ...m, [path]: { confidence: 1, needsReview: false, reason: tr("msg.checkedByYou2712", "Checked by you.") } })) });
  const metaOf = (path: string) => meta[path];

  const setEntry = (key: EntryKey, i: number, patch: Partial<ResumeEntry>) => setP((prev) => ({ ...prev, [key]: prev[key].map((e, j) => (j === i ? { ...e, ...patch } : e)) }));
  const removeEntry = (s: SectionConfig, i: number) => {
    const removed = p[s.key][i];
    setP((prev) => ({ ...prev, [s.key]: prev[s.key].filter((_, j) => j !== i) }));
    toast.success(`${s.one} removed.`, "Save your profile to keep the change.", {
      action: { label: "Undo", onClick: () => setP((prev) => ({ ...prev, [s.key]: [...prev[s.key].slice(0, i), removed, ...prev[s.key].slice(i)] })) },
    });
  };
  const addEntry = (s: SectionConfig) => {
    setP((prev) => ({ ...prev, [s.key]: [...prev[s.key], blankEntry()] }));
    toast.info(`${s.one} added.`, "Fill it in, then save your profile.");
  };

  const save = () => run(() => saveResumeProfile(resumeId, p), { progress: tr("msg.savingYourProfile6b9c", "Saving your profile…") });
  const groups = groupSkills(p.skills);

  return (
    <div className="grid gap-6">
      {draftBanner}
      <section aria-labelledby="contact-heading" className="grid gap-3">
        <h3 id="contact-heading" className="font-medium">
          Contact
        </h3>
        <div className="grid gap-3 sm:grid-cols-2">
          {contactOf(tr).map(([path, label, placeholder]) => {
            const id = `p-${path.replace(".", "-")}`;
            return (
              <FieldShell
                key={path}
                path={path}
                label={label}
                inputId={id}
                meta={metaOf(path)}
                edited={edited(path)}
                onUse={(v) => setP((prev) => setAt(prev, path, v))}
                onConfirm={getAt(p, path) ? () => confirm(path) : undefined}
                confirming={confirmRunner.pending}
              >
                {(a) => <Input id={id} value={getAt(p, path) ?? ""} placeholder={placeholder} onChange={(e) => setP((prev) => setAt(prev, path, nul(e.target.value)))} {...a} />}
              </FieldShell>
            );
          })}
        </div>
        <FieldShell path="summary" label={tr("msg.professionalSummaryabce", "Professional summary")} inputId="p-summary" meta={metaOf("summary")} edited={edited("summary")} onConfirm={p.summary ? () => confirm("summary") : undefined}>
          {(a) => <Textarea id="p-summary" rows={3} value={p.summary ?? ""} onChange={(e) => setP({ ...p, summary: nul(e.target.value) })} {...a} />}
        </FieldShell>
      </section>

      <section aria-labelledby="skills-heading" className="grid gap-3">
        <h3 id="skills-heading" className="font-medium">
          Skills
        </h3>
        <FieldShell path="skills" label={tr("msg.skillsCommaSeparated4eb4", "Skills (comma-separated)")} inputId="p-skills" meta={metaOf("skills")} edited={JSON.stringify(p.skills) !== JSON.stringify(initial.skills)} onConfirm={p.skills.length ? () => confirm("skills") : undefined}>
          {(a) => (
            <Textarea
              id="p-skills"
              rows={3}
              value={p.skills.join(", ")}
              onChange={(e) => setP({ ...p, skills: e.target.value.split(",").map((s) => s.trim()).filter(Boolean).slice(0, 120) })}
              {...a}
            />
          )}
        </FieldShell>
        {p.skills.length ? (
          <dl className="grid gap-1.5 text-sm sm:grid-cols-2" aria-label={tr("msg.yourSkillsByKinde726", "Your skills by kind")}>
            {(Object.keys(SKILL_GROUP_LABELS) as SkillGroup[])
              .filter((g) => groups[g].length)
              .map((g) => (
                <div key={g} className="grid gap-1">
                  <dt className="text-xs text-muted-foreground">{SKILL_GROUP_LABELS[g]}</dt>
                  <dd className="flex flex-wrap gap-1">
                    {groups[g].map((s) => (
                      <Badge key={s} variant="secondary">
                        {s}
                      </Badge>
                    ))}
                  </dd>
                </div>
              ))}
          </dl>
        ) : null}
        <FieldShell path="certifications" label={tr("msg.certificationsAndLicencesOne0b5f", "Certifications and licences (one per line)")} inputId="p-certs" meta={metaOf("certifications")} edited={JSON.stringify(p.certifications) !== JSON.stringify(initial.certifications)}>
          {(a) => <Textarea id="p-certs" rows={2} value={p.certifications.join("\n")} onChange={(e) => setP({ ...p, certifications: lines(e.target.value).slice(0, 30) })} {...a} />}
        </FieldShell>
      </section>

      {sectionsOf(tr).map((s) => (
        <fieldset key={s.key} className="grid gap-3">
          <legend className="mb-1 font-medium">{s.label}</legend>
          {p[s.key].length === 0 ? (
            <p className="text-sm text-muted-foreground" id={fieldAnchor(s.key)}>
              {metaOf(s.key)?.missing ? (metaOf(s.key)?.reason ?? tr("msg.notFoundInYour7b81", "Not found in your resume.")) : tr("msg.nothingReadHere1692", "Nothing read here.")}
            </p>
          ) : null}
          {p[s.key].map((e, i) => (
            <EntryEditor
              key={e.id || `new-${i}`}
              config={s}
              entry={e}
              initial={initial[s.key].find((x) => x.id === e.id)}
              index={i}
              meta={meta}
              onChange={(patch) => setEntry(s.key, i, patch)}
              onRemove={() => removeEntry(s, i)}
              onConfirm={confirm}
              confirming={confirmRunner.pending}
            />
          ))}
          <Button type="button" variant="outline" size="sm" className="justify-self-start" onClick={() => addEntry(s)}>
            <Plus aria-hidden /> Add {s.one.toLowerCase()}
          </Button>
        </fieldset>
      ))}

      <div className="sticky bottom-0 z-10 -mx-4 flex flex-wrap items-center gap-3 border-t bg-background/95 px-4 py-3 backdrop-blur sm:mx-0 sm:rounded-lg sm:border sm:px-3">
        <Button type="button" onClick={save} disabled={pending}>
          {pending ? tr("msg.savingeedf", "Saving…") : tr("msg.saveProfile5d3d", "Save profile")}
        </Button>
        <p className="text-xs text-muted-foreground">{tr("msg.savingChangesYourWorking4a99", "Saving changes your working profile only. Your original resume stays as it was.")}</p>
      </div>
    </div>
  );
}

function EntryEditor({
  config: s,
  entry: e,
  initial,
  index: i,
  meta,
  onChange,
  onRemove,
  onConfirm,
  confirming,
}: {
  config: SectionConfig;
  entry: ResumeEntry;
  initial: ResumeEntry | undefined;
  index: number;
  meta: FieldMetaMap;
  onChange: (patch: Partial<ResumeEntry>) => void;
  onRemove: () => void;
  onConfirm: (path: string) => void;
  confirming: boolean;
}) {
  const tr = useTr();
  const base = `${s.key}-${i}`;
  const entryPath = `${s.key}.${e.id}`;
  const entryMeta = e.id ? meta[entryPath] : undefined;
  const entryEdited = !initial || JSON.stringify(initial) !== JSON.stringify(e);
  const review = entryMeta?.needsReview && !entryEdited;
  const field = (key: "degree" | "major" | "graduation") => `${s.key}.${e.id}.${key}`;
  const tech = s.key === "projects" ? projectTechnologies(e) : [];

  return (
    <div id={e.id ? fieldAnchor(entryPath) : undefined} data-needs-review={review || undefined} className={cn("grid scroll-mt-24 gap-2 rounded-lg border bg-card p-3", review && "border-warning/60 bg-warning-soft/30")}>
      {review ? (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <Badge variant="outline" className="h-5 border-warning/60 px-1.5 text-[11px] text-warning">
            {tr("msg.needsReview2826", "Needs review")}
          </Badge>
          <span>{entryMeta?.reason}</span>
          <Button type="button" size="xs" variant="ghost" disabled={confirming} onClick={() => onConfirm(entryPath)}>
            {tr("msg.looksRight5943", "Looks right")}
          </Button>
        </div>
      ) : null}
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="grid gap-1">
          <Label htmlFor={`${base}-org`}>{s.org}</Label>
          <Input id={`${base}-org`} value={e.organization} onChange={(ev) => onChange({ organization: ev.target.value })} />
        </div>
        <div className="grid gap-1">
          <Label htmlFor={`${base}-title`}>{s.title}</Label>
          <Input id={`${base}-title`} value={e.title ?? ""} onChange={(ev) => onChange({ title: nul(ev.target.value) })} />
        </div>
        {s.education
          ? (["degree", "major", "graduation"] as const).map((k) => (
              <FieldShell
                key={k}
                path={field(k)}
                label={k === "degree" ? tr("msg.degreeOrDiplomaf972", "Degree or diploma") : k === "major" ? tr("msg.majorOrProgramb666", "Major or program") : tr("msg.graduationDate87ab", "Graduation date")}
                inputId={`${base}-${k}`}
                meta={e.id ? meta[field(k)] : undefined}
                edited={(initial?.[k] ?? null) !== e[k]}
                onUse={(v) => onChange({ [k]: v })}
                onConfirm={e[k] && e.id ? () => onConfirm(field(k)) : undefined}
                confirming={confirming}
              >
                {(a) => <Input id={`${base}-${k}`} value={e[k] ?? ""} placeholder={k === "graduation" ? tr("msg.apr2027OrExpected704e", "Apr 2027 or Expected 2027") : undefined} onChange={(ev) => onChange({ [k]: nul(ev.target.value) })} {...a} />}
              </FieldShell>
            ))
          : null}
        {s.dates === "range" ? (
          <>
            <div className="grid gap-1">
              <Label htmlFor={`${base}-start`}>{tr("msg.starta612", "Start")}</Label>
              <Input id={`${base}-start`} value={e.start ?? ""} placeholder={tr("msg.may20245b44", "May 2024")} onChange={(ev) => onChange({ start: nul(ev.target.value) })} />
            </div>
            <div className="grid gap-1">
              <Label htmlFor={`${base}-end`}>{tr("msg.end8755", "End")}</Label>
              <Input id={`${base}-end`} value={e.end ?? ""} placeholder={tr("msg.presentdd05", "Present")} onChange={(ev) => onChange({ end: nul(ev.target.value) })} />
            </div>
          </>
        ) : (
          <div className="grid gap-1">
            <Label htmlFor={`${base}-end`}>{tr("msg.date4474", "Date")}</Label>
            <Input id={`${base}-end`} value={e.end ?? ""} placeholder="2025" onChange={(ev) => onChange({ end: nul(ev.target.value) })} />
          </div>
        )}
        {s.key === "experience" || s.key === "education" ? (
          <div className="grid gap-1">
            <Label htmlFor={`${base}-location`}>{tr("msg.locationce5b", "Location")}</Label>
            <Input id={`${base}-location`} value={e.location ?? ""} onChange={(ev) => onChange({ location: nul(ev.target.value) })} />
          </div>
        ) : null}
      </div>
      <div className="grid gap-1">
        <Label htmlFor={`${base}-bullets`}>{s.key === "experience" ? tr("msg.responsibilitiesAndAccomplishmentsOne07c7", "Responsibilities and accomplishments (one per line)") : tr("msg.detailsOnePerLine2f8d", "Details (one per line)")}</Label>
        <Textarea
          id={`${base}-bullets`}
          rows={Math.max(2, e.bullets.length + 1)}
          value={e.bullets.map((b) => b.text).join("\n")}
          onChange={(ev) => onChange({ bullets: ev.target.value.split("\n").map((text, j) => ({ id: e.bullets[j]?.id ?? "", text })) })}
        />
      </div>
      {tech.length ? (
        <p className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
          Technologies named:{" "}
          {tech.map((t) => (
            <Badge key={t} variant="outline">
              {t}
            </Badge>
          ))}
        </p>
      ) : null}
      <Button type="button" variant="ghost" size="sm" className="justify-self-start" onClick={onRemove}>
        <Trash2 aria-hidden /> Remove
      </Button>
    </div>
  );
}

export function ResumeListActions({ id, active }: { id: string; active: boolean }) {
  const tr = useTr();
  const { pending, run } = useActionRunner();
  return (
    <div className="flex flex-wrap items-center gap-2">
      {!active ? (
        <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => setActiveResume(id))}>
          {tr("msg.useThisOne67eb", "Use this one")}
        </Button>
      ) : null}
      <Button
        size="sm"
        variant="ghost"
        disabled={pending}
        onClick={() => {
          if (confirm("Delete this resume, its original file, its fit checks and its tailored documents? This can't be undone.")) run(() => deleteResume(id), { progress: tr("msg.deleting8349", "Deleting…") });
        }}
      >
        <Trash2 aria-hidden /> Delete
      </Button>
    </div>
  );
}
