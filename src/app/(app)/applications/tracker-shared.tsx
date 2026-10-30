"use client";

import { Bell, CalendarClock } from "lucide-react";
import { AppSelect } from "@/components/app-select";
import type { ApplicationSummary } from "@/lib/applications/load";
import { CLOSED_STAGES, OPEN_STAGES, STAGE_HINT, STAGE_LABEL, STAGES, type Stage } from "@/lib/applications/stages";

export type TrackerApp = ApplicationSummary & { changedLabel: string; appliedLabel: string | null; nextInterviewLabel: string | null };
export type Quiet = { id: string; title: string; company: string | null; days: number; stage: Stage; version: number };

/** Board columns: each open stage, then every closed stage together. */
export const COLUMNS: { key: string; label: string; hint: string; stages: readonly Stage[] }[] = [
  ...OPEN_STAGES.map((s) => ({ key: s, label: STAGE_LABEL[s], hint: STAGE_HINT[s], stages: [s] as const })),
  { key: "closed", label: "Closed", hint: "Accepted, rejected, withdrawn or no response", stages: CLOSED_STAGES },
];

/** What a card's stage menu and the board call to move an application (see useMove in tracker.tsx). */
export type MoveFn = (app: { id: string; stage: Stage; version: number }, to: Stage) => void;

export const SCOPE = "applications";

/** A keyboard-friendly way to move a card: a labelled native select. */
export function MoveSelect({ app, pending, move }: { app: TrackerApp | Quiet; pending: boolean; move: MoveFn }) {
  return (
    <AppSelect
      aria-label={`Stage of ${app.title}`}
      value={app.stage}
      disabled={pending}
      onChange={(e) => move(app, e.target.value as Stage)}
      className="h-7 text-xs"
    >
      {STAGES.map((s) => (
        <option key={s} value={s}>
          {STAGE_LABEL[s]}
        </option>
      ))}
    </AppSelect>
  );
}

export function AppFacts({ app }: { app: TrackerApp }) {
  return (
    <div className="grid gap-1 text-xs text-muted-foreground">
      {app.appliedLabel ? <span>Applied {app.appliedLabel}</span> : null}
      {app.nextInterviewLabel ? (
        <span className="flex items-center gap-1 text-foreground">
          <CalendarClock aria-hidden className="size-3.5" /> {app.nextInterviewLabel}
        </span>
      ) : null}
      {app.openReminders ? (
        <span className="flex items-center gap-1">
          <Bell aria-hidden className="size-3.5" /> {app.openReminders} reminder{app.openReminders === 1 ? "" : "s"}
        </span>
      ) : null}
    </div>
  );
}
