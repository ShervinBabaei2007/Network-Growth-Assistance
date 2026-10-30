"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

type Signals = { setDetailOpen: (open: boolean) => void; setRecordPage: (open: boolean) => void };
const SignalsContext = createContext<Signals | null>(null);

/**
 * The frame of a master-detail list: the list on the left and the selected record on the right at xl and wider.
 * Which state applies is reported by the pieces themselves (see PaneSignal) rather than read from the router or the
 * DOM: Next.js keeps the previous route's subtree mounted but hidden after a navigation, so a DOM check would still
 * see it, while a hidden subtree's effects are cleaned up, so a signal goes away with it.
 *
 *  - nothing selected: list plus a placeholder (xl), or just the list (phone)
 *  - a record opened from the list (the `detail` slot shows a pane): list plus record (xl), or just the record (phone)
 *  - a record opened directly (the page itself is `[id]`): the ordinary full page, in one column
 */
export function MasterDetail({ list, detail }: { list: ReactNode; detail: ReactNode }) {
  const [detailOpen, setDetailOpen] = useState(false);
  const [recordPage, setRecordPage] = useState(false);
  return (
    <SignalsContext value={{ setDetailOpen, setRecordPage }}>
      <div className={cn(recordPage ? "xl:block" : "xl:grid xl:grid-cols-[minmax(0,1fr)_minmax(26rem,34rem)] xl:items-start xl:gap-6")}>
        <div className={cn("min-w-0", detailOpen && !recordPage && "max-xl:hidden")}>{list}</div>
        <aside aria-label="Selected record" className={cn("min-w-0 xl:sticky xl:top-20 xl:max-h-[calc(100dvh-6rem)] xl:overflow-y-auto", recordPage && "hidden")}>
          {detail}
        </aside>
      </div>
    </SignalsContext>
  );
}

/** Rendered by a pane (`detail`) or by the full record page (`record`) to tell the frame it is on screen. */
export function PaneSignal({ kind }: { kind: "detail" | "record" }) {
  const signals = useContext(SignalsContext);
  useEffect(() => {
    if (!signals) return;
    const set = kind === "detail" ? signals.setDetailOpen : signals.setRecordPage;
    set(true);
    return () => set(false);
  }, [signals, kind]);
  return null;
}
