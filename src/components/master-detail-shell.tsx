"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { clampPane, PANE_DEFAULT_REM, PANE_MAX_REM, PANE_MIN_REM, SPLIT_GRID } from "@/lib/pane";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "detail-pane-width";

type Kind = "detail" | "record" | "board";
type Frame = { signal: (kind: Kind, on: boolean) => void; paneRem: number; setPaneRem: (rem: number) => void };
const FrameContext = createContext<Frame | null>(null);

/**
 * The frame of a master-detail list: the list on the left and the selected record on the right at xl and wider.
 * Which state applies is reported by the pieces themselves (see PaneSignal) rather than read from the router or the
 * DOM: Next.js keeps the previous route's subtree mounted but hidden after a navigation, so a DOM check would still
 * see it, while a hidden subtree's effects are cleaned up, so a signal goes away with it.
 *
 *  - nothing selected: list plus a placeholder (xl), or just the list (phone)
 *  - a record opened from the list (the `detail` slot shows a pane): list plus record (xl), or just the record (phone)
 *  - a record opened directly (the page itself is `[id]`): that page lays out the list and the record itself
 *  - a record opened from a board (the Applications board is too wide to sit beside a pane): the record alone
 */
export function MasterDetail({ list, detail }: { list: ReactNode; detail: ReactNode }) {
  const [on, setOn] = useState({ detail: false, record: false, board: false });
  // Until the browser has taken over, the first paint (which came from the server) is told apart with CSS `:has()`; after
  // that the signals below are the truth, because a hidden previous page can still be in the DOM and fool `:has()`.
  const [live, setLive] = useState(false);
  const [paneRem, setPaneRemState] = useState(PANE_DEFAULT_REM);
  const signal = useCallback((kind: Kind, value: boolean) => setOn((s) => (s[kind] === value ? s : { ...s, [kind]: value })), []);

  // The saved width can only be read in the browser; until then the default is used, which is also what the server sent.
  /* eslint-disable react-hooks/set-state-in-effect -- reading browser storage after mount */
  useEffect(() => {
    setLive(true);
    try {
      const saved = Number(localStorage.getItem(STORAGE_KEY));
      if (saved) setPaneRemState(clampPane(saved));
    } catch {
      // Storage can be blocked; the default width is fine.
    }
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */
  const setPaneRem = useCallback((rem: number) => {
    const next = clampPane(rem);
    setPaneRemState(next);
    try {
      localStorage.setItem(STORAGE_KEY, String(next));
    } catch {
      // ignore
    }
  }, []);

  const alone = on.board && on.detail; // a record opened from a board: no list beside it, at any width
  // A record opened directly draws its own list-and-record layout (`pageDraws`); once another record is chosen from
  // its list the frame takes over again and the page shrinks to just its list (`data-pane-open`).
  const pageDraws = on.record && !on.detail;
  return (
    <FrameContext value={{ signal, paneRem, setPaneRem }}>
      <div
        style={{ "--pane-w": `${paneRem}rem` } as React.CSSProperties}
        data-pane-open={live && on.detail ? "" : undefined}
        className={cn("group/md", live ? (pageDraws || alone ? "xl:block" : SPLIT_GRID) : cn(SPLIT_GRID, "xl:has-[[data-record-page]]:block"))}
      >
        <div className={cn("min-w-0", live && (on.detail || alone) && "max-xl:hidden", live && alone && "hidden")}>{list}</div>
        {live && (pageDraws || alone) ? null : <PaneDivider hideWhenRecordPage={!live} />}
        <aside
          aria-label="Selected record"
          className={cn("min-w-0 xl:sticky xl:top-20 xl:max-h-[calc(100dvh-6rem)] xl:overflow-y-auto", live ? pageDraws && "hidden" : "group-has-[[data-record-page]]/md:hidden")}
        >
          {detail}
        </aside>
      </div>
    </FrameContext>
  );
}

/** Rendered by a pane (`detail`), by the full record page (`record`) or by a board (`board`) to tell the frame it is on screen. */
export function PaneSignal({ kind }: { kind: Kind }) {
  const frame = useContext(FrameContext);
  const signal = frame?.signal;
  useEffect(() => {
    if (!signal) return;
    signal(kind, true);
    return () => signal(kind, false);
  }, [signal, kind]);
  return null;
}

/**
 * The draggable edge between a list and its record pane (xl and wider). Drag it, or focus it and use the arrow keys
 * (Home and End for the narrowest and widest). The width is remembered on this device.
 */
export function PaneDivider({ hideWhenRecordPage = false, className }: { hideWhenRecordPage?: boolean; className?: string }) {
  const frame = useContext(FrameContext);
  const ref = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  if (!frame) return null;
  const { paneRem, setPaneRem } = frame;
  const fromPointer = (clientX: number) => {
    const right = ref.current?.parentElement?.getBoundingClientRect().right ?? 0;
    const rootPx = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
    setPaneRem((right - clientX) / rootPx);
  };
  return (
    <div
      ref={ref}
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize the record pane"
      aria-valuemin={PANE_MIN_REM}
      aria-valuemax={PANE_MAX_REM}
      aria-valuenow={paneRem}
      aria-valuetext={`${paneRem} rem wide`}
      tabIndex={0}
      data-testid="pane-divider"
      className={cn(
        "group hidden h-full min-h-24 cursor-col-resize touch-none items-stretch justify-center outline-none xl:flex",
        // On a server-rendered record page the page draws its own divider; this one steps aside until the signals take over.
        hideWhenRecordPage && "xl:group-has-[[data-record-page]]/md:hidden",
        className,
      )}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        setDragging(true);
        fromPointer(e.clientX);
      }}
      onPointerMove={(e) => dragging && fromPointer(e.clientX)}
      onPointerUp={() => setDragging(false)}
      onPointerCancel={() => setDragging(false)}
      onKeyDown={(e) => {
        // The pane is on the right, so Left makes it wider and Right narrower.
        const step = e.key === "ArrowLeft" ? 2 : e.key === "ArrowRight" ? -2 : 0;
        if (step) setPaneRem(paneRem + step);
        else if (e.key === "Home") setPaneRem(PANE_MIN_REM);
        else if (e.key === "End") setPaneRem(PANE_MAX_REM);
        else return;
        e.preventDefault();
      }}
    >
      <span aria-hidden className={cn("w-px bg-border transition-colors group-hover:w-0.5 group-hover:bg-primary group-focus-visible:w-0.5 group-focus-visible:bg-primary", dragging && "w-0.5 bg-primary")} />
    </div>
  );
}
