"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { ArrowDown, ArrowUp, Clock } from "lucide-react";
import { AppSelect } from "@/components/app-select";
import { BulkBarFrame, RowSelect, SelectAll, useBulkSelection } from "@/components/bulk/bulk-select";
import { useActionRunner } from "@/components/toast/use-action-runner";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { SortDir, SortKey } from "@/lib/applications/sort";
import { isClosed, STAGE_LABEL, STAGES, type Stage } from "@/lib/applications/stages";
import { cn } from "@/lib/utils";
import { moveStage } from "./actions";
import { bulkMoveStage, undoBulkMoveStage, type ApplicationsMove } from "./bulk-actions";
import { AppFacts, MoveSelect, SCOPE, type MoveFn, type Quiet, type TrackerApp } from "./tracker-shared";
import dynamic from "next/dynamic";

// The drag-and-drop board (about 70 KB of dnd-kit) loads as its own chunk; its server-rendered markup is already on the page.
const Board = dynamic(() => import("./board").then((m) => m.Board));
export type { TrackerApp } from "./tracker-shared";


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
      <ApplicationsBulkBar apps={apps} />
    </div>
  );
}

/** Appears when applications are ticked: move them all to one stage, with Undo. */
function ApplicationsBulkBar({ apps }: { apps: TrackerApp[] }) {
  const { selected, store } = useBulkSelection(SCOPE);
  const { pending, run } = useActionRunner();
  const [to, setTo] = useState<Stage>("applied");
  const last = useRef<ApplicationsMove | null>(null);
  if (selected.length === 0) return null;
  const versions = new Map(apps.map((a) => [a.id, a.version]));
  const items = selected.flatMap((id) => (versions.has(id) ? [{ id, version: versions.get(id)! }] : []));
  return (
    <BulkBarFrame scope={SCOPE}>
      <label htmlFor="bulk-stage" className="text-muted-foreground">
        Move to
      </label>
      <AppSelect id="bulk-stage" value={to} onChange={(e) => setTo(e.target.value as Stage)} className="h-8 w-40 text-sm">
        {STAGES.map((s) => (
          <option key={s} value={s}>
            {STAGE_LABEL[s]}
          </option>
        ))}
      </AppSelect>
      <Button
        size="sm"
        disabled={pending}
        onClick={() =>
          run(
            async () => {
              const r = await bulkMoveStage(items, to);
              if (r.ok && r.data) {
                last.current = r.data;
                store.clear();
              }
              return r;
            },
            { undo: () => undoBulkMoveStage(last.current!) },
          )
        }
      >
        Move {selected.length}
      </Button>
      <Button size="sm" variant="ghost" onClick={() => store.clear()}>
        Clear
      </Button>
    </BulkBarFrame>
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

function NoResponseSuggestions({ quiet, afterDays, pending, move }: { quiet: Quiet[]; afterDays: number; pending: boolean; move: MoveFn }) {
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

const HEADINGS: { key: SortKey; label: string }[] = [
  { key: "title", label: "Role" },
  { key: "company", label: "Company" },
  { key: "stage", label: "Stage" },
  { key: "applied", label: "Applied" },
  { key: "updated", label: "Last change" },
];

function List({ apps, sort, pending, move }: { apps: TrackerApp[]; sort: { key: SortKey; dir: SortDir }; pending: boolean; move: MoveFn }) {
  return (
    <div className="overflow-x-auto rounded-xl border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-10">
              <SelectAll scope={SCOPE} ids={apps.map((a) => a.id)} label="Select every application" />
            </TableHead>
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
              <TableCell>
                <RowSelect scope={SCOPE} id={a.id} name={a.title} />
              </TableCell>
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
