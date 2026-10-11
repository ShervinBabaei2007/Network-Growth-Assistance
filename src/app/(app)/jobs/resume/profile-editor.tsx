"use client";

import { useState, useTransition } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { ResumeEntry, ResumeProfile } from "@/lib/job-postings/types";
import { deleteResume, saveResumeProfile, setActiveResume } from "../actions";

type EntryKey = "experience" | "projects" | "education";
const SECTIONS: { key: EntryKey; label: string; org: string; title: string }[] = [
  { key: "experience", label: "Experience", org: "Employer", title: "Job title" },
  { key: "projects", label: "Projects", org: "Project", title: "Role or tech (optional)" },
  { key: "education", label: "Education", org: "School", title: "Credential and program" },
];

const blankEntry = (): ResumeEntry => ({ id: "", organization: "", title: null, start: null, end: null, location: null, bullets: [] });
const lines = (s: string) => s.split("\n").map((l) => l.trim()).filter(Boolean);

/**
 * Corrects what was read from the PDF. Whatever is saved here counts as the resume:
 * tailored documents can only use what's in it.
 */
export function ProfileEditor({ resumeId, initial }: { resumeId: string; initial: ResumeProfile }) {
  const [p, setP] = useState(initial);
  const [pending, start] = useTransition();
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);

  const setEntry = (key: EntryKey, i: number, patch: Partial<ResumeEntry>) => setP((prev) => ({ ...prev, [key]: prev[key].map((e, j) => (j === i ? { ...e, ...patch } : e)) }));
  const nul = (s: string) => (s.trim() ? s : null);

  const save = () =>
    start(async () => {
      const r = await saveResumeProfile(resumeId, p);
      setStatus(r.ok ? { ok: true, text: r.message ?? "Saved." } : { ok: false, text: r.error });
    });

  return (
    <div className="grid gap-5">
      <div className="grid gap-3 sm:grid-cols-2">
        {([
          ["name", "Name"],
          ["email", "Email"],
          ["phone", "Phone"],
          ["location", "Location"],
        ] as const).map(([k, label]) => (
          <div key={k} className="grid gap-1.5">
            <Label htmlFor={`p-${k}`}>{label}</Label>
            <Input id={`p-${k}`} value={p[k] ?? ""} onChange={(e) => setP({ ...p, [k]: nul(e.target.value) })} />
          </div>
        ))}
        <div className="grid gap-1.5 sm:col-span-2">
          <Label htmlFor="p-links">Links (one per line)</Label>
          <Textarea id="p-links" rows={2} value={p.links.join("\n")} onChange={(e) => setP({ ...p, links: lines(e.target.value).slice(0, 6) })} />
        </div>
        <div className="grid gap-1.5 sm:col-span-2">
          <Label htmlFor="p-summary">Summary</Label>
          <Textarea id="p-summary" rows={3} value={p.summary ?? ""} onChange={(e) => setP({ ...p, summary: nul(e.target.value) })} />
        </div>
      </div>

      {SECTIONS.map((s) => (
        <fieldset key={s.key} className="grid gap-3">
          <legend className="mb-1 font-medium">{s.label}</legend>
          {p[s.key].length === 0 ? <p className="text-sm text-muted-foreground">Nothing read here.</p> : null}
          {p[s.key].map((e, i) => (
            <div key={i} className="grid gap-2 rounded-lg border bg-card p-3">
              <div className="grid gap-2 sm:grid-cols-2">
                <div className="grid gap-1">
                  <Label htmlFor={`${s.key}-${i}-org`}>{s.org}</Label>
                  <Input id={`${s.key}-${i}-org`} value={e.organization} onChange={(ev) => setEntry(s.key, i, { organization: ev.target.value })} />
                </div>
                <div className="grid gap-1">
                  <Label htmlFor={`${s.key}-${i}-title`}>{s.title}</Label>
                  <Input id={`${s.key}-${i}-title`} value={e.title ?? ""} onChange={(ev) => setEntry(s.key, i, { title: nul(ev.target.value) })} />
                </div>
                <div className="grid gap-1">
                  <Label htmlFor={`${s.key}-${i}-start`}>Start</Label>
                  <Input id={`${s.key}-${i}-start`} value={e.start ?? ""} placeholder="May 2024" onChange={(ev) => setEntry(s.key, i, { start: nul(ev.target.value) })} />
                </div>
                <div className="grid gap-1">
                  <Label htmlFor={`${s.key}-${i}-end`}>End</Label>
                  <Input id={`${s.key}-${i}-end`} value={e.end ?? ""} placeholder="Present" onChange={(ev) => setEntry(s.key, i, { end: nul(ev.target.value) })} />
                </div>
              </div>
              <div className="grid gap-1">
                <Label htmlFor={`${s.key}-${i}-bullets`}>Bullets (one per line)</Label>
                <Textarea
                  id={`${s.key}-${i}-bullets`}
                  rows={Math.max(2, e.bullets.length + 1)}
                  value={e.bullets.map((b) => b.text).join("\n")}
                  onChange={(ev) => setEntry(s.key, i, { bullets: ev.target.value.split("\n").map((text, j) => ({ id: e.bullets[j]?.id ?? "", text })) })}
                />
              </div>
              <Button type="button" variant="ghost" size="sm" className="justify-self-start" onClick={() => setP({ ...p, [s.key]: p[s.key].filter((_, j) => j !== i) })}>
                <Trash2 aria-hidden /> Remove
              </Button>
            </div>
          ))}
          <Button type="button" variant="outline" size="sm" className="justify-self-start" onClick={() => setP({ ...p, [s.key]: [...p[s.key], blankEntry()] })}>
            <Plus aria-hidden /> Add {s.label.toLowerCase().replace(/s$/, "")}
          </Button>
        </fieldset>
      ))}

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor="p-skills">Skills (comma-separated)</Label>
          <Textarea
            id="p-skills"
            rows={3}
            value={p.skills.join(", ")}
            onChange={(e) => setP({ ...p, skills: e.target.value.split(",").map((s) => s.trim()).filter(Boolean).slice(0, 120) })}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="p-certs">Certifications and licences (one per line)</Label>
          <Textarea id="p-certs" rows={3} value={p.certifications.join("\n")} onChange={(e) => setP({ ...p, certifications: lines(e.target.value).slice(0, 30) })} />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" onClick={save} disabled={pending}>
          {pending ? "Saving…" : "Save resume"}
        </Button>
        {status ? (
          <p role={status.ok ? "status" : "alert"} className={status.ok ? "text-sm text-muted-foreground" : "text-sm text-destructive"}>
            {status.text}
          </p>
        ) : null}
      </div>
    </div>
  );
}

export function ResumeListActions({ id, active }: { id: string; active: boolean }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>) =>
    start(async () => {
      const r = await fn();
      setError(r.ok ? null : (r.error ?? "Failed."));
    });
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
          if (confirm("Delete this resume, with its fit checks and tailored documents?")) run(() => deleteResume(id));
        }}
      >
        <Trash2 aria-hidden /> Delete
      </Button>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
