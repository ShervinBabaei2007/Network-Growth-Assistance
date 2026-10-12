"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { ProgressMeter } from "@/components/progress-meter";
import { Button } from "@/components/ui/button";
import { fieldAnchor } from "./field-status";

export type SummaryField = { path: string; label: string; reason?: string };

/**
 * After an import, and for as long as anything needs checking: how much was filled, what
 * needs attention (each a link to the field) and what wasn't found. The marks on the
 * fields themselves stay until each is fixed or confirmed.
 */
export function ImportSummary({
  justImported,
  filled,
  completeness,
  missingChecks,
  needsReview,
  missing,
}: {
  justImported: boolean;
  filled: number;
  completeness: number;
  missingChecks: string[];
  needsReview: SummaryField[];
  missing: SummaryField[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(true);
  if (!open) return null;
  const go = (path: string) => {
    const el = document.getElementById(fieldAnchor(path));
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
    el?.querySelector<HTMLElement>("input, textarea, button")?.focus({ preventScroll: true });
  };

  return (
    <section id="import-summary" aria-labelledby="import-summary-title" className="grid scroll-mt-24 gap-3 rounded-xl border bg-card p-4">
      <div className="flex items-start gap-3">
        {needsReview.length ? <AlertTriangle aria-hidden className="mt-0.5 size-5 text-warning" /> : <CheckCircle2 aria-hidden className="mt-0.5 size-5 text-success" />}
        <div className="grid gap-1">
          <h2 id="import-summary-title" className="font-medium">
            {justImported ? "Resume imported successfully." : needsReview.length ? "Your profile needs a check" : "Your profile"}
          </h2>
          <p className="text-sm text-muted-foreground">
            {filled} profile field{filled === 1 ? " was" : "s were"} filled.{" "}
            {needsReview.length ? `${needsReview.length} field${needsReview.length === 1 ? " needs" : "s need"} your attention.` : "Nothing needs checking."}
          </p>
        </div>
      </div>

      <div className="grid gap-1">
        <div className="flex items-center justify-between text-sm">
          <span>Profile completeness</span>
          <span className="font-medium tabular-nums">{completeness}%</span>
        </div>
        <ProgressMeter accepted={completeness} target={100} label="Profile completeness" />
        {missingChecks.length ? <p className="text-xs text-muted-foreground">Still missing: {missingChecks.join(", ")}.</p> : null}
      </div>

      {needsReview.length ? (
        <div className="grid gap-1.5">
          <h3 className="text-sm font-medium">{needsReview.length} field{needsReview.length === 1 ? "" : "s"} need verification</h3>
          <ul className="flex flex-wrap gap-1.5">
            {needsReview.map((f) => (
              <li key={f.path}>
                <Button size="xs" variant="outline" className="border-warning/60" onClick={() => go(f.path)}>
                  <AlertTriangle aria-hidden className="text-warning" /> {f.label}
                </Button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {missing.length ? (
        <div className="grid gap-1">
          <h3 className="text-sm font-medium">Not found in your resume</h3>
          <ul className="grid gap-0.5 text-sm text-muted-foreground">
            {missing.map((f) => (
              <li key={f.path}>
                <button type="button" className="underline-offset-4 hover:underline" onClick={() => go(f.path)}>
                  {f.label}
                </button>
                : {f.reason ?? "Not found in your resume."} You can add it yourself.
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {needsReview.length ? <Button onClick={() => go(needsReview[0].path)}>Review fields</Button> : null}
        <Button
          variant="outline"
          onClick={() => {
            setOpen(false);
            if (justImported) router.replace("/jobs/resume", { scroll: false });
          }}
        >
          Continue
        </Button>
      </div>
    </section>
  );
}
