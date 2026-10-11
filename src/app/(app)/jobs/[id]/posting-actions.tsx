"use client";

import { useState, useTransition } from "react";
import { Bookmark, CheckCircle2, RotateCcw, Sparkles, Wand2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { checkFit, setJobStatus, tailorFree, tailorWithAI, type ActionResult } from "../actions";

function useRun() {
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const run = (fn: () => Promise<ActionResult>, busy?: string) =>
    start(async () => {
      if (busy) setMessage({ ok: true, text: busy });
      const r = await fn();
      setMessage(r.ok ? (r.message ? { ok: true, text: r.message } : null) : { ok: false, text: r.error });
    });
  const note = message ? (
    <p role={message.ok ? "status" : "alert"} className={message.ok ? "text-sm text-muted-foreground" : "text-sm text-destructive"}>
      {message.text}
    </p>
  ) : null;
  return { pending, run, note };
}

export function StatusActions({ jobId, status }: { jobId: string; status: "saved" | "applied" | "dismissed" | null }) {
  const { pending, run, note } = useRun();
  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap gap-2">
        {status === null ? (
          <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => setJobStatus(jobId, "saved"))}>
            <Bookmark aria-hidden /> Save
          </Button>
        ) : null}
        {status !== "applied" ? (
          <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => setJobStatus(jobId, "applied"))}>
            <CheckCircle2 aria-hidden /> I applied
          </Button>
        ) : null}
        {status !== "dismissed" ? (
          <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => setJobStatus(jobId, "dismissed"))}>
            <X aria-hidden /> Not interested
          </Button>
        ) : (
          <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => setJobStatus(jobId, null))}>
            <RotateCcw aria-hidden /> Restore
          </Button>
        )}
      </div>
      {note}
    </div>
  );
}

export function CheckFitButton({ jobId, label = "Check fit" }: { jobId: string; label?: string }) {
  const { pending, run, note } = useRun();
  return (
    <div className="grid gap-2">
      <Button size="sm" variant="outline" className="justify-self-start" disabled={pending} onClick={() => run(() => checkFit(jobId), "Checking against your resume…")}>
        <Sparkles aria-hidden /> {pending ? "Checking…" : label}
      </Button>
      {note}
    </div>
  );
}

/**
 * Free tailoring for a job the resume meets; for one it doesn't, "Tailor anyway" after
 * the user has seen why it was set aside. AI rewording is an optional extra.
 */
export function TailorButtons({ jobId, excluded, hasDocs, ai }: { jobId: string; excluded: boolean; hasDocs: boolean; ai: { available: boolean; note: string } }) {
  const { pending, run, note } = useRun();
  const [confirming, setConfirming] = useState(false);
  const mode = excluded ? "apply_anyway" : "normal";

  if (excluded && !confirming) {
    return (
      <div className="grid gap-2">
        <Button variant="outline" className="justify-self-start" disabled={pending} onClick={() => setConfirming(true)}>
          <Wand2 aria-hidden /> Tailor anyway
        </Button>
        {note}
      </div>
    );
  }
  return (
    <div className="grid gap-2">
      {excluded ? (
        <div className="grid gap-1 rounded-lg border bg-card border-dashed p-3 text-sm">
          <p className="font-medium">Applying anyway</p>
          <p className="text-muted-foreground">
            Your resume will lead with your most related experience, and the cover letter will briefly and honestly name the gap. Nothing you
            don&apos;t have will be added: no skills, years, degrees or licences.
          </p>
        </div>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        <Button disabled={pending} onClick={() => run(() => tailorFree(jobId, mode), "Tailoring…")}>
          <Wand2 aria-hidden /> {hasDocs ? "Tailor again" : excluded ? "Tailor them anyway" : "Tailor resume and cover letter"}
        </Button>
        <Button variant="outline" disabled={pending || !ai.available} title={ai.note} onClick={() => run(() => tailorWithAI(jobId, mode), "Rewriting with AI. This takes up to a minute…")}>
          <Sparkles aria-hidden /> Rewrite with AI
        </Button>
        {excluded ? (
          <Button variant="ghost" disabled={pending} onClick={() => setConfirming(false)}>
            Cancel
          </Button>
        ) : null}
      </div>
      <p className="text-xs text-muted-foreground">
        Free tailoring picks and orders your own lines and writes a template letter. {ai.note}
      </p>
      {note}
    </div>
  );
}
