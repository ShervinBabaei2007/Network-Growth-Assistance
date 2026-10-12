"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Bookmark, CheckCircle2, FileText, ListChecks, Mail, RotateCcw, ScrollText, Sparkles, Wand2, X } from "lucide-react";
import { useActionRunner } from "@/components/toast/use-action-runner";
import { Button } from "@/components/ui/button";
import { checkFit, setJobStatus } from "../actions";
import { generateCoverLetter, getImprovementNotes, tailorForJob, type WorkResult } from "./actions";

type Status = "saved" | "applied" | "dismissed" | null;

/** Save, applied and not interested, each undoable from its toast. */
export function StatusActions({ jobId, status }: { jobId: string; status: Status }) {
  const { pending, run } = useActionRunner();
  const set = (next: Status) => run(() => setJobStatus(jobId, next), { undo: () => setJobStatus(jobId, status) });
  return (
    <div className="flex flex-wrap gap-2">
      {status === null ? (
        <Button size="sm" variant="outline" disabled={pending} onClick={() => set("saved")}>
          <Bookmark aria-hidden /> Save
        </Button>
      ) : status === "saved" ? (
        <Button size="sm" variant="outline" disabled={pending} onClick={() => set(null)}>
          <Bookmark aria-hidden className="fill-current" /> Saved
        </Button>
      ) : null}
      {status !== "applied" ? (
        <Button size="sm" variant="outline" disabled={pending} onClick={() => set("applied")}>
          <CheckCircle2 aria-hidden /> I applied
        </Button>
      ) : null}
      {status !== "dismissed" ? (
        <Button size="sm" variant="ghost" disabled={pending} onClick={() => set("dismissed")}>
          <X aria-hidden /> Not interested
        </Button>
      ) : (
        <Button size="sm" variant="ghost" disabled={pending} onClick={() => set(null)}>
          <RotateCcw aria-hidden /> Restore
        </Button>
      )}
    </div>
  );
}

export function CheckFitButton({ jobId, label = "Check fit" }: { jobId: string; label?: string }) {
  const { pending, run } = useActionRunner();
  return (
    <Button size="sm" variant="outline" className="justify-self-start" disabled={pending} onClick={() => run(() => checkFit(jobId), { progress: "Checking against your resume…" })}>
      <Sparkles aria-hidden /> {pending ? "Checking…" : label}
    </Button>
  );
}

export type AiStatus = { available: boolean; note: string };

/**
 * Two ways to work on the resume for this job, plus a CV and a cover letter:
 * "Tailor Resume" (AI writes a new copy; do it for me) and "Get Resume Improvement Notes"
 * (nothing changes; tell me what I should change). Without AI, tailoring gives the notes
 * instead and says why.
 */
export function WorkActions({ jobId, role, excluded, ai }: { jobId: string; role: string; excluded: boolean; ai: AiStatus }) {
  const router = useRouter();
  const { pending, run } = useActionRunner();
  const [confirming, setConfirming] = useState(false);
  const mode = excluded ? "apply_anyway" : "normal";
  const go = (anchor: string) => {
    router.refresh();
    setTimeout(() => document.getElementById(anchor)?.scrollIntoView({ behavior: "smooth", block: "start" }), 400);
  };
  const after = (anchor: string) => (r: WorkResult) => go(r.data?.fallback === "notes" ? "notes" : anchor);
  const runWork = (fn: () => Promise<WorkResult>, progress: string, anchor: string) =>
    run(fn, {
      progress,
      onSuccess: (r) => after(anchor)(r as WorkResult),
    });
  // A fallback to notes returns ok:false (nothing was tailored) but still has notes to show.
  const tailor = (format: "resume" | "cv") =>
    run(
      async () => {
        const r = await tailorForJob(jobId, mode, format);
        if (!r.ok && r.data?.fallback === "notes") go("notes");
        return r;
      },
      { progress: `Tailoring your ${format === "cv" ? "CV" : "resume"} for ${role}…`, onSuccess: () => go("documents") },
    );

  if (excluded && !confirming) {
    return (
      <div className="grid gap-3">
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" disabled={pending} onClick={() => setConfirming(true)}>
            <Wand2 aria-hidden /> Tailor anyway
          </Button>
          <Button variant="outline" disabled={pending} onClick={() => runWork(() => getImprovementNotes(jobId, ai.available), "Analyzing your resume against this job…", "notes")}>
            <ListChecks aria-hidden /> Get Resume Improvement Notes
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-4">
      {excluded ? (
        <div className="grid gap-1 rounded-lg border border-dashed bg-card p-3 text-sm">
          <p className="font-medium">Applying anyway</p>
          <p className="text-muted-foreground">
            Your documents will lead with your most related experience, and a cover letter will briefly and honestly name the gap. Nothing you don&apos;t have will be
            added: no skills, years, degrees or licences.
          </p>
        </div>
      ) : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="grid content-start gap-1.5 rounded-lg border p-3">
          <Button disabled={pending} onClick={() => tailor("resume")}>
            <Wand2 aria-hidden /> Tailor Resume
          </Button>
          <p className="text-xs text-muted-foreground">Do it for me: AI rewrites a new copy for this job, checked line by line against your resume. Your resume isn&apos;t changed.</p>
        </div>
        <div className="grid content-start gap-1.5 rounded-lg border p-3">
          <Button variant="outline" disabled={pending} onClick={() => runWork(() => getImprovementNotes(jobId, ai.available), "Analyzing your resume against this job…", "notes")}>
            <ListChecks aria-hidden /> Get Resume Improvement Notes
          </Button>
          <p className="text-xs text-muted-foreground">Tell me what to change: specific advice for this job, by section and priority. Nothing is changed.</p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="outline" disabled={pending} onClick={() => tailor("cv")}>
          <ScrollText aria-hidden /> Tailor CV
        </Button>
        <Button size="sm" variant="outline" disabled={pending || !ai.available} title={ai.available ? undefined : ai.note} onClick={() => runWork(() => generateCoverLetter(jobId, mode, true), `Writing a cover letter for ${role}…`, "documents")}>
          <Mail aria-hidden /> Generate Cover Letter
        </Button>
        <Button size="sm" variant="ghost" disabled={pending} onClick={() => runWork(() => generateCoverLetter(jobId, mode, false), "Filling a cover letter template…", "documents")}>
          <FileText aria-hidden /> Template letter (no AI)
        </Button>
        {excluded ? (
          <Button size="sm" variant="ghost" disabled={pending} onClick={() => setConfirming(false)}>
            Cancel
          </Button>
        ) : null}
      </div>
      <p className="text-xs text-muted-foreground">{ai.note}</p>
    </div>
  );
}
