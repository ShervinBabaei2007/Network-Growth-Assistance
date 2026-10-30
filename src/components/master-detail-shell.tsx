"use client";

import type { ReactNode } from "react";
import { useSelectedLayoutSegment } from "next/navigation";
import { cn } from "@/lib/utils";

/** What the `detail` slot reports when no record is open: its own page, its default, or the slot placeholder. */
const EMPTY_SLOT = ["__PAGE__", "__DEFAULT__", "(__SLOT__)"];

/**
 * The frame of a master-detail list: the list on the left and the selected record on the right at xl and wider.
 * Which of the three states applies comes from the router's active segments, not from the DOM, because Next.js keeps
 * the previous route's subtree mounted (hidden) after a navigation and a CSS `:has()` check would still see it.
 *
 *  - nothing selected: list plus a placeholder (xl), or just the list (phone)
 *  - a record opened from the list (the `detail` slot is active): list plus record (xl), or just the record (phone)
 *  - a record opened directly (the page itself is `[id]`): the ordinary full page, in one column
 */
export function MasterDetail({ list, detail }: { list: ReactNode; detail: ReactNode }) {
  const recordPage = useSelectedLayoutSegment() !== null; // `children` is the [id] page, not the list
  const slot = useSelectedLayoutSegment("detail");
  const detailOpen = slot !== null && !EMPTY_SLOT.includes(slot);
  return (
    <div className={cn(recordPage ? "xl:block" : "xl:grid xl:grid-cols-[minmax(0,1fr)_minmax(26rem,34rem)] xl:items-start xl:gap-6")}>
      <div className={cn("min-w-0", detailOpen && !recordPage && "max-xl:hidden")}>{list}</div>
      <aside aria-label="Selected record" className={cn("min-w-0 xl:sticky xl:top-20 xl:max-h-[calc(100dvh-6rem)] xl:overflow-y-auto", recordPage && "hidden")}>
        {detail}
      </aside>
    </div>
  );
}
