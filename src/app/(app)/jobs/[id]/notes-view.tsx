"use client";

import { useState } from "react";
import Link from "next/link";
import { AlertTriangle, Check, Copy, EyeOff, KeyRound, ListChecks, RotateCcw, ShieldCheck } from "lucide-react";
import { toast } from "@/components/toast/notify";
import { useActionRunner } from "@/components/toast/use-action-runner";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { NOTE_SECTIONS, type NotePriority, type NoteSection } from "@/lib/job-postings/note-sections";
import type { NotesReport } from "@/lib/job-postings/improvement-notes";
import { cn } from "@/lib/utils";
import { setNoteDismissed, type FallbackReason } from "./actions";

const SECTION_LABELS: Record<NoteSection, string> = { summary: "Summary", skills: "Skills", experience: "Experience", projects: "Projects", education: "Education", other: "Other" };
const PRIORITY: Record<NotePriority, { label: string; className: string }> = {
  high: { label: "High priority", className: "border-destructive/40 bg-danger-soft text-destructive" },
  medium: { label: "Medium priority", className: "border-warning/50 bg-warning-soft text-warning" },
  optional: { label: "Optional", className: "border-border bg-muted text-muted-foreground" },
};

const FALLBACK_COPY: Record<FallbackReason, string> = {
  quota_exhausted: "Your free AI tailoring limit has been reached for today. We haven't modified your resume. Instead, we've generated personalized improvement notes showing exactly how you can better align it with this job.",
  no_key: "AI tailoring needs a Gemini API key, and none is set up. We haven't modified your resume. Instead, we've generated personalized improvement notes showing exactly how you can better align it with this job.",
  ai_failed: "AI rewriting is currently unavailable. Your resume was not modified. We've generated personalized Improvement Notes instead, showing what you can change yourself.",
  not_material: "We couldn't produce a meaningful rewrite of your resume for this job without inventing details, so no tailored version was saved. Your original resume was not changed. These notes show what you could change yourself.",
};

/** Hours until the free AI allowance resets (it counts per UTC day). */
const hoursToReset = (now = new Date()) => Math.max(1, Math.ceil((Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1) - now.getTime()) / 3600_000));

export function NotesView({
  notesId,
  report,
  dismissed,
  reason,
  methodLabel,
  made,
  stale,
}: {
  notesId: string;
  report: NotesReport;
  dismissed: string[];
  reason: string;
  methodLabel: string;
  made: string;
  stale: boolean;
}) {
  const { pending, run } = useActionRunner();
  const [showBanner, setShowBanner] = useState(reason !== "requested");
  const [showDismissed, setShowDismissed] = useState(false);
  const fallback = reason !== "requested" ? (reason as FallbackReason) : null;
  const visible = report.notes.filter((n) => showDismissed || !dismissed.includes(n.id));
  const hidden = report.notes.length - report.notes.filter((n) => !dismissed.includes(n.id)).length;

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Suggestion copied.");
    } catch {
      toast.warning("Couldn't copy automatically.", "Select the text and copy it.");
    }
  };

  return (
    <div className="grid gap-5">
      {fallback && showBanner ? (
        <div role="note" className="grid gap-3 rounded-lg border border-warning/50 bg-warning-soft/50 p-3 text-sm">
          <p className="flex gap-2">
            <AlertTriangle aria-hidden className="mt-0.5 size-4 shrink-0 text-warning" />
            <span>{FALLBACK_COPY[fallback]}</span>
          </p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={() => document.getElementById("notes-list")?.scrollIntoView({ behavior: "smooth" })}>
              <ListChecks aria-hidden /> View Improvement Notes
            </Button>
            <Link href="/settings#ai-key" className={buttonVariants({ size: "sm", variant: "outline" })}>
              <KeyRound aria-hidden /> Use My Own AI Key
            </Link>
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                toast.info(
                  fallback === "quota_exhausted" ? `Your free AI uses reset in about ${hoursToReset()} hours (midnight UTC).` : "Try “Tailor Resume” again later.",
                  "Your resume stays as it is until then.",
                )
              }
            >
              Try AI Tailoring Again Later
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setShowBanner(false);
                toast.success("Keeping your original resume.", "Nothing was changed.");
              }}
            >
              <ShieldCheck aria-hidden /> Keep Original Resume
            </Button>
          </div>
        </div>
      ) : null}

      <p className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <Badge variant="outline">{methodLabel}</Badge>
        Made {made}. Analysis only: your resume was not changed.
        {stale ? <span className="text-warning">Your resume has changed since; get new notes to see the latest.</span> : null}
      </p>

      <section aria-labelledby="comparison-heading" className="grid gap-3">
        <h3 id="comparison-heading" className="font-medium">
          How your resume compares
        </h3>
        <div className="grid gap-3 md:grid-cols-3">
          <KeywordColumn title="Strong matches" tone="success" items={report.comparison.strong.map((k) => ({ term: k.term, detail: k.where ? `in ${k.where}` : undefined }))} empty="None of the posting's key terms stand out yet." />
          <KeywordColumn title="Could be emphasized more" tone="warning" items={report.comparison.couldEmphasize.map((k) => ({ term: k.term, detail: k.where ? `only in ${k.where}` : undefined }))} empty="Nothing buried." />
          <KeywordColumn title="Not found in resume" tone="danger" items={report.comparison.notFound.map((k) => ({ term: k.term, detail: k.message }))} empty="Every key term appears in your resume." />
        </div>
        {report.comparison.missingQualifications.length ? (
          <ul className="grid gap-1 text-sm">
            {report.comparison.missingQualifications.map((q) => (
              <li key={q.text} className="text-muted-foreground">
                {q.message}
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      <section id="notes-list" aria-labelledby="notes-heading" className="grid scroll-mt-24 gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 id="notes-heading" className="font-medium">
            {report.counts.total} suggestion{report.counts.total === 1 ? "" : "s"}
            <span className="ml-2 text-xs font-normal text-muted-foreground">
              {report.counts.high} high · {report.counts.medium} medium · {report.counts.optional} optional
            </span>
          </h3>
          {hidden ? (
            <Button size="xs" variant="ghost" onClick={() => setShowDismissed((v) => !v)}>
              {showDismissed ? "Hide dismissed" : `Show ${hidden} dismissed`}
            </Button>
          ) : null}
        </div>
        {report.strongMatch ? <p className="text-sm text-success">Your resume is already a strong match for this job. The suggestions below are optional.</p> : null}
        {NOTE_SECTIONS.map((section) => {
          const items = visible.filter((n) => n.section === section);
          if (!items.length) return null;
          return (
            <div key={section} className="grid gap-2">
              <h4 className="text-sm font-semibold">{SECTION_LABELS[section]}</h4>
              <ul className="grid gap-2">
                {items.map((n) => {
                  const isDismissed = dismissed.includes(n.id);
                  return (
                    <li key={n.id} className={cn("grid gap-1.5 rounded-lg border bg-card p-3 text-sm", isDismissed && "opacity-60")}>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Badge variant="outline" className={PRIORITY[n.priority].className}>
                          {PRIORITY[n.priority].label}
                        </Badge>
                        {n.source === "ai" ? <Badge variant="outline">AI suggestion</Badge> : null}
                      </div>
                      <p className="font-medium">{n.recommendation}</p>
                      <p className="text-muted-foreground">
                        <span className="font-medium text-foreground">Why: </span>
                        {n.why}
                      </p>
                      {n.resumeQuote ? <p className="border-l-2 pl-2 text-xs text-muted-foreground">Your resume: “{n.resumeQuote}”</p> : null}
                      <div className="flex flex-wrap gap-1">
                        <Button size="xs" variant="ghost" onClick={() => copy(`${n.recommendation}\nWhy: ${n.why}`)}>
                          <Copy aria-hidden /> Copy
                        </Button>
                        <Button
                          size="xs"
                          variant="ghost"
                          disabled={pending}
                          onClick={() => run(() => setNoteDismissed(notesId, n.id, !isDismissed), isDismissed ? {} : { undo: () => setNoteDismissed(notesId, n.id, false) })}
                        >
                          {isDismissed ? <RotateCcw aria-hidden /> : <EyeOff aria-hidden />} {isDismissed ? "Restore" : "Dismiss"}
                        </Button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
        {!visible.length ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Check aria-hidden className="size-4" /> No suggestions left.
          </p>
        ) : null}
      </section>
    </div>
  );
}

function KeywordColumn({ title, tone, items, empty }: { title: string; tone: "success" | "warning" | "danger"; items: { term: string; detail?: string }[]; empty: string }) {
  const toneClass = { success: "border-t-success", warning: "border-t-warning", danger: "border-t-destructive" }[tone];
  return (
    <div className={cn("grid content-start gap-2 rounded-lg border border-t-4 bg-card p-3", toneClass)}>
      <p className="text-sm font-semibold">{title}</p>
      {items.length ? (
        <ul className="grid gap-1.5 text-sm">
          {items.map((i) => (
            <li key={i.term}>
              <span className="font-medium">{i.term}</span>
              {i.detail ? <span className="block text-xs text-muted-foreground">{i.detail}</span> : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-muted-foreground">{empty}</p>
      )}
    </div>
  );
}
