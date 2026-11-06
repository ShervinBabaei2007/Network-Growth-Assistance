"use client";

import { useState } from "react";
import Link from "next/link";
import { GripVertical } from "lucide-react";
import { DndContext, KeyboardSensor, PointerSensor, TouchSensor, closestCenter, pointerWithin, useDraggable, useDroppable, useSensor, useSensors, type Announcements, type CollisionDetection, type DragEndEvent, type KeyboardCoordinateGetter } from "@dnd-kit/core";
import { AppSelect } from "@/components/app-select";
import { RowSelect } from "@/components/bulk/bulk-select";
import { notify } from "@/components/toast/notify";
import { useActionRunner } from "@/components/toast/use-action-runner";
import { Badge } from "@/components/ui/badge";
import { dropOutcome } from "@/lib/applications/drop";
import { type Stage } from "@/lib/applications/stages";
import { cn } from "@/lib/utils";
import { moveStage } from "./actions";
import { AppFacts, COLUMNS, MoveSelect, SCOPE, useStageText, type MoveFn, type TrackerApp } from "./tracker-shared";

/** A card's drag handle. Pointer, touch and keyboard (Space to lift, arrows to move, Space to drop) all start here. */
function DragHandle({ id, title }: { id: string; title: string }) {
  const { tr } = useStageText();
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
      aria-label={tr("applicationsPage.moveCardLabel", "Move {title} to another stage", { title })}
      className="-ml-1 mt-0.5 hidden shrink-0 cursor-grab touch-none rounded p-0.5 text-muted-foreground hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none active:cursor-grabbing md:block"
    >
      <GripVertical aria-hidden className="size-4" />
    </button>
  );
}

function BoardCard({ app, closed, pending, move, dragging }: { app: TrackerApp; closed: boolean; pending: boolean; move: MoveFn; dragging: boolean }) {
  const { tr, label } = useStageText();
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
            {label(app.stage)}
          </Badge>
        ) : null}
        {app.attempt > 1 ? <span className="text-xs text-muted-foreground">{tr("applicationsPage.attempt", "Attempt {n}", { n: app.attempt })}</span> : null}
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

export function Board({ apps, pending, move }: { apps: TrackerApp[]; pending: boolean; move: MoveFn }) {
  // A dragged card shows in its new column at once; the server's answer then replaces this (or it is rolled back).
  const [optimistic, setOptimistic] = useState<Record<string, { stage: Stage; version: number }>>({});
  const [activeId, setActiveId] = useState<string | null>(null);
  const { run } = useActionRunner();
  const { tr, label, hint } = useStageText();
  const [prevApps, setPrevApps] = useState(apps);
  if (prevApps !== apps) {
    setPrevApps(apps);
    setOptimistic({});
  }
  const shown = apps.map((a) => (optimistic[a.id] ? { ...a, ...optimistic[a.id] } : a));
  const byId = new Map(shown.map((a) => [a.id, a]));

  const columns = COLUMNS.map((c) => ({ ...c, label: label(c.key as Stage | "closed"), hint: hint(c.key as Stage | "closed"), apps: shown.filter((a) => c.stages.includes(a.stage)) }));
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
      notify({ type: "info", title: tr("applicationsPage.closedHint", outcome.message) });
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

  const titleOf = (id: string | number) => byId.get(String(id))?.title ?? tr("applicationsPage.card", "card");
  const columnName = (column: string) => label(column as Stage | "closed");
  const announcements: Announcements = {
    onDragStart: ({ active }) => tr("applicationsPage.pickedUp", "Picked up {title}.", { title: titleOf(active.id) }),
    onDragOver: ({ active, over }) => {
      const a = byId.get(String(active.id));
      if (!a) return undefined;
      return over
        ? tr("applicationsPage.overColumn", "{title} is over {column}.", { title: a.title, column: columnName(String(over.id)) })
        : tr("applicationsPage.notOverColumn", "{title}, {stage}, is not over a column.", { title: a.title, stage: label(a.stage) });
    },
    onDragEnd: ({ active, over }) =>
      over
        ? tr("applicationsPage.dropped", "{title} was dropped on {column}.", { title: titleOf(active.id), column: columnName(String(over.id)) })
        : tr("applicationsPage.droppedNothing", "{title} was dropped. Nothing changed.", { title: titleOf(active.id) }),
    onDragCancel: ({ active }) => tr("applicationsPage.cancelled", "Moving {title} was cancelled.", { title: titleOf(active.id) }),
  };

  return (
    <div className="grid gap-3">
      {/* On a phone, one column at a time. */}
      <div className="grid gap-1 md:hidden">
        <label htmlFor="board-column" className="text-sm font-medium">
          {tr("applicationsPage.stageLabel", "Stage")}
        </label>
        <AppSelect id="board-column" value={shownColumn} onChange={(e) => setShownColumn(e.target.value)}>
          {columns.map((c) => (
            <option key={c.key} value={c.key}>
              {c.label} ({c.apps.length})
            </option>
          ))}
        </AppSelect>
      </div>
      <p className="hidden text-xs text-muted-foreground md:block">{tr("applicationsPage.dragHint", "Drag a card by its grip to another column, or use the stage menu on the card.")}</p>
      <DndContext
        // A fixed id keeps dnd-kit's generated aria ids the same on the server and the client.
        id="applications-board"
        sensors={sensors}
        collisionDetection={collide}
        accessibility={{
          announcements,
          screenReaderInstructions: { draggable: tr("applicationsPage.dragInstructions", "To pick up a card, press Space. Use the arrow keys to move it to another column, then press Space to drop it, or Escape to cancel.") },
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
                <p className="px-1 py-3 text-xs text-muted-foreground">{tr("applicationsPage.nothingHere", "Nothing here.")}</p>
              )}
            </DropColumn>
          ))}
        </div>
      </DndContext>
    </div>
  );
}
