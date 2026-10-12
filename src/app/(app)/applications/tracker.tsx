"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowDown, ArrowUp, Bell, CalendarClock, Clock } from "lucide-react";
import { NativeSelect } from "@/components/native-select";
import { useActionRunner } from "@/components/toast/use-action-runner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { ApplicationSummary } from "@/lib/applications/load";
import type { SortDir, SortKey } from "@/lib/applications/sort";
import { CLOSED_STAGES, isClosed, OPEN_STAGES, STAGE_HINT, STAGE_LABEL, STAGES, type Stage } from "@/lib/applications/stages";
import { cn } from "@/lib/utils";
import { moveStage } from "./actions";

export type TrackerApp = ApplicationSummary & { changedLabel: string; appliedLabel: string | null; nextInterviewLabel: string | null };
type Quiet = { id: string; title: string; company: string | null; days: number; stage: Stage; version: number };

/** Board columns: each open stage, then every closed stage together. */
const COLUMNS: { key: string; label: string; hint: string; stages: readonly Stage[] }[] = [
  ...OPEN_STAGES.map((s) => ({ key: s, label: STAGE_LABEL[s], hint: STAGE_HINT[s], stages: [s] as const })),
  { key: "closed", label: "Closed", hint: "Accepted, rejected, withdrawn or no response", stages: CLOSED_STAGES },
];

/** Moves an application from any view, with Undo back to where it was. */
function useMove() {
  const { pending, run } = useActionRunner();
  const move = (app: { id: string; stage: Stage; version: number }, to: Stage) => {
    if (to === app.stage) return;
    let version = app.version + 1;
    run(
      async () => {
        const r = await moveStage(app.id, to, app.version);
        if (r.ok && r.data) version = r.data.version;
        return r;
      },
      { undo: () => moveStage(app.id, app.stage, version) },
    );
  };
  return { pending, move };
}

export function Tracker({ apps, view, sort, quiet, afterDays }: { apps: TrackerApp[]; view: "board" | "list"; sort: { key: SortKey; dir: SortDir }; quiet: Quiet[]; afterDays: number }) {
  const { pending, move } = useMove();
  return (
    <div className="grid gap-5">
      <nav aria-label="View" className="flex flex-wrap items-center gap-2">
        <ViewLink href="/applications" active={view === "board"}>
          Board
        </ViewLink>
        <ViewLink href={`/applications?view=list&sort=${sort.key}&dir=${sort.dir}`} active={view === "list"}>
          List
        </ViewLink>
        <span className="ml-auto text-sm text-muted-foreground">
          {apps.length} application{apps.length === 1 ? "" : "s"}, {apps.filter((a) => !isClosed(a.stage)).length} open
        </span>
      </nav>

      {quiet.length ? <NoResponseSuggestions quiet={quiet} afterDays={afterDays} pending={pending} move={move} /> : null}

      {view === "board" ? <Board apps={apps} pending={pending} move={move} /> : <List apps={apps} sort={sort} pending={pending} move={move} />}
    </div>
  );
}

function ViewLink({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn("rounded-md border px-3 py-1 text-sm", active ? "border-primary bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:text-foreground")}
    >
      {children}
    </Link>
  );
}

/** A keyboard-friendly way to move a card: a labelled native select. */
function MoveSelect({ app, pending, move }: { app: TrackerApp | Quiet; pending: boolean; move: ReturnType<typeof useMove>["move"] }) {
  return (
    <NativeSelect
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
    </NativeSelect>
  );
}

function NoResponseSuggestions({ quiet, afterDays, pending, move }: { quiet: Quiet[]; afterDays: number; pending: boolean; move: ReturnType<typeof useMove>["move"] }) {
  const [open, setOpen] = useState(false);
  return (
    <section aria-labelledby="quiet-title" className="grid gap-2 rounded-xl border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="quiet-title" className="flex items-center gap-2 text-sm font-medium">
          <Clock aria-hidden className="size-4 text-muted-foreground" />
          {quiet.length} application{quiet.length === 1 ? " has" : "s have"} had no reply for {afterDays}+ days
        </h2>
        <Button size="sm" variant="ghost" aria-expanded={open} onClick={() => setOpen(!open)}>
          {open ? "Hide" : "Review"}
        </Button>
      </div>
      <p className="text-sm text-muted-foreground">Nothing changes unless you choose. You can set the number of days in Settings.</p>
      {open ? (
        <ul className="grid gap-2">
          {quiet.map((q) => (
            <li key={q.id} className="flex flex-wrap items-center justify-between gap-2 border-t pt-2 text-sm">
              <Link href={`/applications/${q.id}`} className="font-medium hover:underline">
                {q.title}
                {q.company ? <span className="font-normal text-muted-foreground"> · {q.company}</span> : null}
              </Link>
              <span className="flex items-center gap-2">
                <span className="text-muted-foreground">{q.days} days</span>
                <Button size="sm" variant="outline" disabled={pending} onClick={() => move(q, "no_response")}>
                  Mark no response
                </Button>
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

function AppFacts({ app }: { app: TrackerApp }) {
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

function Board({ apps, pending, move }: { apps: TrackerApp[]; pending: boolean; move: ReturnType<typeof useMove>["move"] }) {
  const columns = COLUMNS.map((c) => ({ ...c, apps: apps.filter((a) => c.stages.includes(a.stage)) }));
  const [shown, setShown] = useState(() => columns.find((c) => c.apps.length)?.key ?? "saved");
  return (
    <div className="grid gap-3">
      {/* On a phone, one column at a time. */}
      <div className="grid gap-1 md:hidden">
        <label htmlFor="board-column" className="text-sm font-medium">
          Stage
        </label>
        <NativeSelect id="board-column" value={shown} onChange={(e) => setShown(e.target.value)}>
          {columns.map((c) => (
            <option key={c.key} value={c.key}>
              {c.label} ({c.apps.length})
            </option>
          ))}
        </NativeSelect>
      </div>
      <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
        {columns.map((c) => (
          <section key={c.key} aria-labelledby={`col-${c.key}`} className={cn("grid content-start gap-2 rounded-xl bg-muted/50 p-2", c.key !== shown && "hidden md:grid")}>
            <header className="px-1">
              <h2 id={`col-${c.key}`} className="flex items-center justify-between text-sm font-medium">
                {c.label} <span className="text-xs font-normal text-muted-foreground">{c.apps.length}</span>
              </h2>
              <p className="text-xs text-muted-foreground">{c.hint}</p>
            </header>
            {c.apps.length ? (
              <ul className="grid gap-2">
                {c.apps.map((a) => (
                  <li key={a.id} className="grid gap-2 rounded-lg border bg-card p-2.5 text-sm">
                    <div className="grid gap-0.5">
                      <Link href={`/applications/${a.id}`} className="font-medium leading-snug break-words hover:underline">
                        {a.title}
                      </Link>
                      {a.company ? <span className="text-xs break-words text-muted-foreground">{a.company}</span> : null}
                      {c.key === "closed" ? (
                        <Badge variant={a.stage === "accepted" ? "default" : "secondary"} className="mt-1">
                          {STAGE_LABEL[a.stage]}
                        </Badge>
                      ) : null}
                      {a.attempt > 1 ? <span className="text-xs text-muted-foreground">Attempt {a.attempt}</span> : null}
                    </div>
                    <AppFacts app={a} />
                    <MoveSelect app={a} pending={pending} move={move} />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-1 py-3 text-xs text-muted-foreground">Nothing here.</p>
            )}
          </section>
        ))}
      </div>
    </div>
  );
}

const HEADINGS: { key: SortKey; label: string }[] = [
  { key: "title", label: "Role" },
  { key: "company", label: "Company" },
  { key: "stage", label: "Stage" },
  { key: "applied", label: "Applied" },
  { key: "updated", label: "Last change" },
];

function List({ apps, sort, pending, move }: { apps: TrackerApp[]; sort: { key: SortKey; dir: SortDir }; pending: boolean; move: ReturnType<typeof useMove>["move"] }) {
  return (
    <div className="overflow-x-auto rounded-xl border">
      <Table>
        <TableHeader>
          <TableRow>
            {HEADINGS.map((h) => {
              const active = sort.key === h.key;
              const next: SortDir = active && sort.dir === "asc" ? "desc" : "asc";
              return (
                <TableHead key={h.key} aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}>
                  <Link href={`/applications?view=list&sort=${h.key}&dir=${next}`} className="inline-flex items-center gap-1 hover:text-foreground">
                    {h.label}
                    {active ? sort.dir === "asc" ? <ArrowUp aria-hidden className="size-3.5" /> : <ArrowDown aria-hidden className="size-3.5" /> : null}
                    <span className="sr-only">{active ? `, sorted ${sort.dir === "asc" ? "ascending" : "descending"}` : ", sort"}</span>
                  </Link>
                </TableHead>
              );
            })}
            <TableHead>Next</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {apps.map((a) => (
            <TableRow key={a.id}>
              <TableCell className="max-w-64 whitespace-normal">
                <Link href={`/applications/${a.id}`} className="font-medium hover:underline">
                  {a.title}
                </Link>
                {a.attempt > 1 ? <span className="block text-xs text-muted-foreground">Attempt {a.attempt}</span> : null}
              </TableCell>
              <TableCell className="max-w-48 whitespace-normal">{a.company ?? <span className="text-muted-foreground">—</span>}</TableCell>
              <TableCell className="min-w-36">
                <MoveSelect app={a} pending={pending} move={move} />
              </TableCell>
              <TableCell>{a.appliedLabel ?? <span className="text-muted-foreground">—</span>}</TableCell>
              <TableCell>{a.changedLabel}</TableCell>
              <TableCell className="whitespace-normal">
                <AppFacts app={{ ...a, appliedLabel: null }} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
