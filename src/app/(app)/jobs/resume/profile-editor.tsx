"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "@/components/toast/notify";
import { useActionRunner } from "@/components/toast/use-action-runner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { getAt, setAt } from "@/lib/job-postings/resume-paths";
import { groupSkills, projectTechnologies, SKILL_GROUP_LABELS, type SkillGroup } from "@/lib/job-postings/skill-groups";
import type { FieldMetaMap, ResumeEntry, ResumeProfile } from "@/lib/job-postings/types";
import { cn } from "@/lib/utils";
import { confirmResumeField, deleteResume, saveResumeProfile, setActiveResume } from "./actions";
import { FieldShell, fieldAnchor } from "./field-status";

type EntryKey = "experience" | "projects" | "education" | "awards" | "activities";
type SectionConfig = { key: EntryKey; label: string; one: string; org: string; title: string; education?: boolean; dates: "range" | "single" };
const SECTIONS: SectionConfig[] = [
  { key: "experience", label: "Work experience", one: "Experience", org: "Employer", title: "Job title", dates: "range" },
  { key: "education", label: "Education", one: "Education", org: "School", title: "Credential line (as written)", education: true, dates: "range" },
  { key: "projects", label: "Projects", one: "Project", org: "Project name", title: "Role or tech line (optional)", dates: "range" },
  { key: "awards", label: "Awards", one: "Award", org: "Award", title: "Given by (optional)", dates: "single" },
  { key: "activities", label: "Extracurricular activities", one: "Activity", org: "Organization or club", title: "Role", dates: "range" },
];

const blankEntry = (): ResumeEntry => ({ id: "", organization: "", title: null, start: null, end: null, location: null, bullets: [], degree: null, major: null, graduation: null });
const lines = (s: string) => s.split("\n").map((l) => l.trim()).filter(Boolean);
const nul = (s: string) => (s.trim() ? s : null);

const CONTACT: [path: string, label: string, placeholder?: string][] = [
  ["name", "Full name"],
  ["email", "Email"],
  ["phone", "Phone number"],
  ["location", "Location", "Vancouver, BC"],
  ["contact.linkedin", "LinkedIn URL", "linkedin.com/in/…"],
  ["contact.github", "GitHub URL", "github.com/…"],
  ["contact.website", "Portfolio website", "yourname.dev"],
];

/**
 * Checks and corrects what was read from the resume. Fields the parser wasn't sure about
 * are marked until changed or confirmed; fields it couldn't find say so. Whatever is saved
 * here is the profile used for fit checks and tailoring. The original resume never changes.
 */
export function ProfileEditor({ resumeId, initial, meta: initialMeta }: { resumeId: string; initial: ResumeProfile; meta: FieldMetaMap }) {
  const [p, setP] = useState(initial);
  const [meta, setMeta] = useState(initialMeta);
  const { pending, run } = useActionRunner();
  const confirmRunner = useActionRunner();

  const edited = (path: string) => getAt(p, path) !== getAt(initial, path);
  const confirm = (path: string) =>
    confirmRunner.run(() => confirmResumeField(resumeId, path), { onSuccess: () => setMeta((m) => ({ ...m, [path]: { confidence: 1, needsReview: false, reason: "Checked by you." } })) });
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

  const save = () => run(() => saveResumeProfile(resumeId, p), { progress: "Saving your profile…" });
  const groups = groupSkills(p.skills);

  return (
    <div className="grid gap-6">
      <section aria-labelledby="contact-heading" className="grid gap-3">
        <h3 id="contact-heading" className="font-medium">
          Contact
        </h3>
        <div className="grid gap-3 sm:grid-cols-2">
          {CONTACT.map(([path, label, placeholder]) => {
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
        <FieldShell path="summary" label="Professional summary" inputId="p-summary" meta={metaOf("summary")} edited={edited("summary")} onConfirm={p.summary ? () => confirm("summary") : undefined}>
          {(a) => <Textarea id="p-summary" rows={3} value={p.summary ?? ""} onChange={(e) => setP({ ...p, summary: nul(e.target.value) })} {...a} />}
        </FieldShell>
      </section>

      <section aria-labelledby="skills-heading" className="grid gap-3">
        <h3 id="skills-heading" className="font-medium">
          Skills
        </h3>
        <FieldShell path="skills" label="Skills (comma-separated)" inputId="p-skills" meta={metaOf("skills")} edited={JSON.stringify(p.skills) !== JSON.stringify(initial.skills)} onConfirm={p.skills.length ? () => confirm("skills") : undefined}>
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
          <dl className="grid gap-1.5 text-sm sm:grid-cols-2" aria-label="Your skills by kind">
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
        <FieldShell path="certifications" label="Certifications and licences (one per line)" inputId="p-certs" meta={metaOf("certifications")} edited={JSON.stringify(p.certifications) !== JSON.stringify(initial.certifications)}>
          {(a) => <Textarea id="p-certs" rows={2} value={p.certifications.join("\n")} onChange={(e) => setP({ ...p, certifications: lines(e.target.value).slice(0, 30) })} {...a} />}
        </FieldShell>
      </section>

      {SECTIONS.map((s) => (
        <fieldset key={s.key} className="grid gap-3">
          <legend className="mb-1 font-medium">{s.label}</legend>
          {p[s.key].length === 0 ? (
            <p className="text-sm text-muted-foreground" id={fieldAnchor(s.key)}>
              {metaOf(s.key)?.missing ? (metaOf(s.key)?.reason ?? "Not found in your resume.") : "Nothing read here."}
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
          {pending ? "Saving…" : "Save profile"}
        </Button>
        <p className="text-xs text-muted-foreground">Saving changes your working profile only. Your original resume stays as it was.</p>
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
            Needs review
          </Badge>
          <span>{entryMeta?.reason}</span>
          <Button type="button" size="xs" variant="ghost" disabled={confirming} onClick={() => onConfirm(entryPath)}>
            Looks right
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
                label={k === "degree" ? "Degree or diploma" : k === "major" ? "Major or program" : "Graduation date"}
                inputId={`${base}-${k}`}
                meta={e.id ? meta[field(k)] : undefined}
                edited={(initial?.[k] ?? null) !== e[k]}
                onUse={(v) => onChange({ [k]: v })}
                onConfirm={e[k] && e.id ? () => onConfirm(field(k)) : undefined}
                confirming={confirming}
              >
                {(a) => <Input id={`${base}-${k}`} value={e[k] ?? ""} placeholder={k === "graduation" ? "Apr 2027 or Expected 2027" : undefined} onChange={(ev) => onChange({ [k]: nul(ev.target.value) })} {...a} />}
              </FieldShell>
            ))
          : null}
        {s.dates === "range" ? (
          <>
            <div className="grid gap-1">
              <Label htmlFor={`${base}-start`}>Start</Label>
              <Input id={`${base}-start`} value={e.start ?? ""} placeholder="May 2024" onChange={(ev) => onChange({ start: nul(ev.target.value) })} />
            </div>
            <div className="grid gap-1">
              <Label htmlFor={`${base}-end`}>End</Label>
              <Input id={`${base}-end`} value={e.end ?? ""} placeholder="Present" onChange={(ev) => onChange({ end: nul(ev.target.value) })} />
            </div>
          </>
        ) : (
          <div className="grid gap-1">
            <Label htmlFor={`${base}-end`}>Date</Label>
            <Input id={`${base}-end`} value={e.end ?? ""} placeholder="2025" onChange={(ev) => onChange({ end: nul(ev.target.value) })} />
          </div>
        )}
        {s.key === "experience" || s.key === "education" ? (
          <div className="grid gap-1">
            <Label htmlFor={`${base}-location`}>Location</Label>
            <Input id={`${base}-location`} value={e.location ?? ""} onChange={(ev) => onChange({ location: nul(ev.target.value) })} />
          </div>
        ) : null}
      </div>
      <div className="grid gap-1">
        <Label htmlFor={`${base}-bullets`}>{s.key === "experience" ? "Responsibilities and accomplishments (one per line)" : "Details (one per line)"}</Label>
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
  const { pending, run } = useActionRunner();
  return (
    <div className="flex flex-wrap items-center gap-2">
      {!active ? (
        <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => setActiveResume(id))}>
          Use this one
        </Button>
      ) : null}
      <Button
        size="sm"
        variant="ghost"
        disabled={pending}
        onClick={() => {
          if (confirm("Delete this resume, its original file, its fit checks and its tailored documents? This can't be undone.")) run(() => deleteResume(id), { progress: "Deleting…" });
        }}
      >
        <Trash2 aria-hidden /> Delete
      </Button>
    </div>
  );
}
