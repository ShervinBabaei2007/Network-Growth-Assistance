"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { nextRowIndex, SPLIT_MIN_WIDTH } from "@/lib/list-nav";

const ROW_LINK = "a[data-row-link]";

/**
 * Makes a server-rendered list behave like a master list: the row for the open record is marked (aria-current), and
 * on a wide screen the arrow keys move focus to the next or previous row and open it in the detail pane. Rows are
 * ordinary links (put `data-row-link` on each), so with JavaScript off, or on a phone, they are just links and Enter
 * opens the record's page as before. Only one small client component per list; the rows stay on the server.
 */
export function ListKeyNav({ children, className }: { children: ReactNode; className?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    for (const a of ref.current?.querySelectorAll<HTMLAnchorElement>(ROW_LINK) ?? []) {
      if (new URL(a.href).pathname === pathname) a.setAttribute("aria-current", "true");
      else a.removeAttribute("aria-current");
    }
  }, [pathname, children]);

  return (
    <div
      ref={ref}
      className={className}
      onKeyDown={(e) => {
        if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
        const focused = document.activeElement;
        if (!(focused instanceof HTMLAnchorElement) || !focused.matches(ROW_LINK) || !ref.current?.contains(focused)) return;
        if (window.innerWidth < SPLIT_MIN_WIDTH) return; // on a phone the arrow keys keep their normal job
        const rows = Array.from(ref.current.querySelectorAll<HTMLAnchorElement>(ROW_LINK));
        const to = nextRowIndex(rows.indexOf(focused), rows.length, e.key);
        if (to === null) return;
        e.preventDefault();
        const target = rows[to];
        target.focus();
        if (target !== focused) router.replace(target.pathname + target.search, { scroll: false });
      }}
    >
      {children}
    </div>
  );
}
