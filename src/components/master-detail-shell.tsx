"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { SPLIT_GRID } from "@/lib/pane";
import { cn } from "@/lib/utils";

type Kind = "detail" | "record" | "board";
type Frame = { signal: (kind: Kind, on: boolean) => void };
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
  const signal = useCallback((kind: Kind, value: boolean) => setOn((s) => (s[kind] === value ? s : { ...s, [kind]: value })), []);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- marks that the browser has taken over from the server's markup
  useEffect(() => setLive(true), []);

  const alone = on.board && on.detail; // a record opened from a board: no list beside it, at any width
  // A record opened directly draws its own list-and-record layout (`pageDraws`); once another record is chosen from
  // its list the frame takes over again and the page shrinks to just its list (`data-pane-open`).
  const pageDraws = on.record && !on.detail;
  // The board is six columns wide: with nothing open it takes the full width and no empty pane is reserved beside it.
  const boardOnly = on.board && !on.detail;
  return (
    <FrameContext value={{ signal }}>
      <div
        data-pane-open={live && on.detail ? "" : undefined}
        className={cn("group/md", live ? (pageDraws || alone || boardOnly ? "xl:block" : SPLIT_GRID) : cn(SPLIT_GRID, "xl:has-[[data-record-page]]:block xl:has-[[data-board-view]]:block"))}
      >
        <div className={cn("min-w-0", live && (on.detail || alone) && "max-xl:hidden", live && alone && "hidden")}>{list}</div>
        <aside
          aria-label="Selected record"
          className={cn("min-w-0 xl:sticky xl:top-20 xl:max-h-[calc(100dvh-6rem)] xl:overflow-y-auto", live ? (pageDraws || boardOnly) && "hidden" : "group-has-[[data-record-page]]/md:hidden group-has-[[data-board-view]]/md:hidden")}
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
