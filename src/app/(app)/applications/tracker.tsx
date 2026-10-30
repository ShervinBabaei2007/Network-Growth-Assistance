"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { ArrowDown, ArrowUp, Bell, CalendarClock, Clock, GripVertical } from "lucide-react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  closestCenter,
  pointerWithin,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type Announcements,
  type CollisionDetection,
  type DragEndEvent,
  type KeyboardCoordinateGetter,
} from "@dnd-kit/core";
import { AppSelect } from "@/components/app-select";
import { BulkBarFrame, RowSelect, SelectAll, useBulkSelection } from "@/components/bulk/bulk-select";
import { notify } from "@/components/toast/notify";
import { useActionRunner } from "@/components/toast/use-action-runner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { ApplicationSummary } from "@/lib/applications/load";
import { columnLabel, dragAnnouncement, dropOutcome } from "@/lib/applications/drop";
import type { SortDir, SortKey } from "@/lib/applications/sort";
import { CLOSED_STAGES, isClosed, OPEN_STAGES, STAGE_HINT, STAGE_LABEL, STAGES, type Stage } from "@/lib/applications/stages";
import { cn } from "@/lib/utils";
import { moveStage } from "./actions";
import { bulkMoveStage, undoBulkMoveStage, type ApplicationsMove } from "./bulk-actions";

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
      <ApplicationsBulkBar apps={apps} />
    </div>
  );
}

const SCOPE = "applications";

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

/** A keyboard-friendly way to move a card: a labelled native select. */
function MoveSelect({ app, pending, move }: { app: TrackerApp | Quiet; pending: boolean; move: ReturnType<typeof useMove>["move"] }) {
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

/** A card's drag handle. Pointer, touch and keyboard (Space to lift, arrows to move, Space to drop) all start here. */
function DragHandle({ id, title }: { id: string; title: string }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef } = useDraggable({ id });
  return (
    <button
      type="button"
      ref={(el) => {
        // The handle is both the dragged node (dnd-kit measures it for collisions) and the activator.
        setNodeRef(el);
        setActivatorNodeRef(el);
      }}
      {...attributes}
      {...listeners}
      aria-label={`Move ${title} to another stage`}
      className="-ml-1 mt-0.5 hidden shrink-0 cursor-grab touch-none rounded p-0.5 text-muted-foreground hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none active:cursor-grabbing md:block"
    >
      <GripVertical aria-hidden className="size-4" />
    </button>
  );
}

function BoardCard({ app, closed, pending, move, dragging }: { app: TrackerApp; closed: boolean; pending: boolean; move: ReturnType<typeof useMove>["move"]; dragging: boolean }) {
  return (
    <li data-testid="board-card" className={cn("grid gap-2 rounded-lg border bg-card p-2.5 text-sm", dragging && "opacity-40")}>
      <div className="grid gap-0.5">
        <div className="flex items-start gap-2">
          <RowSelect scope={SCOPE} id={app.id} name={app.title} />
          <Link href={`/applications/${app.id}`} className="font-medium leading-snug break-words hover:underline">
            {app.title}
          </Link>
          <DragHandle id={app.id} title={app.title} />
        </div>
        {app.company ? <span className="text-xs break-words text-muted-foreground">{app.company}</span> : null}
        {closed ? (
          <Badge variant={app.stage === "accepted" ? "default" : "secondary"} className="mt-1">
            {STAGE_LABEL[app.stage]}
          </Badge>
        ) : null}
        {app.attempt > 1 ? <span className="text-xs text-muted-foreground">Attempt {app.attempt}</span> : null}
      </div>
      <AppFacts app={app} />
      <MoveSelect app={app} pending={pending} move={move} />
    </li>
  );
}

function DropColumn({ id, className, children, ...props }: { id: string } & React.ComponentProps<"section">) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <section ref={setNodeRef} data-column={id} className={cn(className, isOver && "ring-2 ring-primary")} {...props}>
      {children}
    </section>
  );
}

/**
 * Left and right jump to the next column in that direction (columns are tall, so small steps would take many
 * presses); up and down move in small steps. Anything else is ignored.
 */
const columnKeyboard: KeyboardCoordinateGetter = (event, { currentCoordinates, context: { droppableRects, droppableContainers, collisionRect } }) => {
  if (!collisionRect) return;
  if (event.code === "ArrowDown" || event.code === "ArrowUp") {
    event.preventDefault();
    return { x: currentCoordinates.x, y: currentCoordinates.y + (event.code === "ArrowDown" ? 40 : -40) };
  }
  if (event.code !== "ArrowLeft" && event.code !== "ArrowRight") return;
  event.preventDefault();
  const dir = event.code === "ArrowRight" ? 1 : -1;
  const cx = collisionRect.left + collisionRect.width / 2;
  const cy = collisionRect.top + collisionRect.height / 2;
  let best: { x: number; y: number; d: number } | null = null;
  for (const c of droppableContainers.getEnabled()) {
    const r = droppableRects.get(c.id);
    if (!r) continue;
    const rx = r.left + r.width / 2;
    const ry = r.top + r.height / 2;
    if ((rx - cx) * dir <= 1) continue;
    const d = Math.hypot(rx - cx, ry - cy);
    if (!best || d < best.d) best = { x: rx - collisionRect.width / 2, y: ry - collisionRect.height / 2, d };
  }
  return best ? { x: best.x, y: best.y } : undefined;
};

const collide: CollisionDetection = (args) => (args.pointerCoordinates ? pointerWithin(args) : closestCenter(args));

function Board({ apps, pending, move }: { apps: TrackerApp[]; pending: boolean; move: ReturnType<typeof useMove>["move"] }) {
  // A dragged card shows in its new column at once; the server's answer then replaces this (or it is rolled back).
  const [optimistic, setOptimistic] = useState<Record<string, { stage: Stage; version: number }>>({});
  const [activeId, setActiveId] = useState<string | null>(null);
  const { run } = useActionRunner();
  const [prevApps, setPrevApps] = useState(apps);
  if (prevApps !== apps) {
    setPrevApps(apps);
    setOptimistic({});
  }
  const shown = apps.map((a) => (optimistic[a.id] ? { ...a, ...optimistic[a.id] } : a));
  const byId = new Map(shown.map((a) => [a.id, a]));

  const columns = COLUMNS.map((c) => ({ ...c, apps: shown.filter((a) => c.stages.includes(a.stage)) }));
  const [shownColumn, setShownColumn] = useState(() => columns.find((c) => c.apps.length)?.key ?? "saved");

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: columnKeyboard }),
  );

  const drop = (e: DragEndEvent) => {
    setActiveId(null);
    const app = byId.get(String(e.active.id));
    if (!app || !e.over) return;
    const outcome = dropOutcome(String(e.over.id), app.stage);
    if (outcome.kind === "hint") {
      notify({ type: "info", title: outcome.message });
      return;
    }
    if (outcome.kind !== "move") return;
    const { to } = outcome;
    const fromStage = app.stage;
    setOptimistic((o) => ({ ...o, [app.id]: { stage: to, version: app.version } }));
    let version = app.version + 1;
    run(
      async () => {
        const r = await moveStage(app.id, to, app.version);
        if (r.ok && r.data) {
          version = r.data.version;
          setOptimistic((o) => ({ ...o, [app.id]: { stage: to, version } }));
        } else {
          // A stale version (changed in another tab) or any other failure: show the card where the server has it.
          setOptimistic((o) => {
            const rest = { ...o };
            delete rest[app.id];
            return rest;
          });
        }
        return r;
      },
      { undo: () => moveStage(app.id, fromStage, version) },
    );
  };

  const titleOf = (id: string | number) => byId.get(String(id))?.title ?? "card";
  const announcements: Announcements = {
    onDragStart: ({ active }) => `Picked up ${titleOf(active.id)}.`,
    onDragOver: ({ active, over }) => {
      const a = byId.get(String(active.id));
      return a ? dragAnnouncement(a.title, a.stage, over ? String(over.id) : null) : undefined;
    },
    onDragEnd: ({ active, over }) => (over ? `${titleOf(active.id)} was dropped on ${columnLabel(String(over.id))}.` : `${titleOf(active.id)} was dropped. Nothing changed.`),
    onDragCancel: ({ active }) => `Moving ${titleOf(active.id)} was cancelled.`,
  };

  return (
    <div className="grid gap-3">
      {/* On a phone, one column at a time. */}
      <div className="grid gap-1 md:hidden">
        <label htmlFor="board-column" className="text-sm font-medium">
          Stage
        </label>
        <AppSelect id="board-column" value={shownColumn} onChange={(e) => setShownColumn(e.target.value)}>
          {columns.map((c) => (
            <option key={c.key} value={c.key}>
              {c.label} ({c.apps.length})
            </option>
          ))}
        </AppSelect>
      </div>
      <p className="hidden text-xs text-muted-foreground md:block">Drag a card by its grip to another column, or use the stage menu on the card.</p>
      <DndContext
        // A fixed id keeps dnd-kit's generated aria ids the same on the server and the client.
        id="applications-board"
        sensors={sensors}
        collisionDetection={collide}
        accessibility={{
          announcements,
          screenReaderInstructions: { draggable: "To pick up a card, press Space. Use the arrow keys to move it to another column, then press Space to drop it, or Escape to cancel." },
        }}
        onDragStart={(e) => setActiveId(String(e.active.id))}
        onDragEnd={drop}
        onDragCancel={() => setActiveId(null)}
      >
        <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
          {columns.map((c) => (
            <DropColumn key={c.key} id={c.key} aria-labelledby={`col-${c.key}`} className={cn("grid content-start gap-2 rounded-xl bg-muted/50 p-2", c.key !== shownColumn && "hidden md:grid")}>
              <header className="px-1">
                <h2 id={`col-${c.key}`} className="flex items-center justify-between text-sm font-medium">
                  {c.label} <span className="text-xs font-normal text-muted-foreground">{c.apps.length}</span>
                </h2>
                <p className="text-xs text-muted-foreground">{c.hint}</p>
              </header>
              {c.apps.length ? (
                <ul className="grid gap-2">
                  {c.apps.map((a) => (
                    <BoardCard key={a.id} app={a} closed={c.key === "closed"} pending={pending} move={move} dragging={activeId === a.id} />
                  ))}
                </ul>
              ) : (
                <p className="px-1 py-3 text-xs text-muted-foreground">Nothing here.</p>
              )}
            </DropColumn>
          ))}
        </div>
      </DndContext>
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
