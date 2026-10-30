import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

/**
 * A list with its selected record beside it on wide screens (xl and up), built from a parallel `@detail` route that
 * intercepts `[id]`. The record keeps its own URL: opening it by link, reload or share shows the ordinary full page
 * (marked `data-record-page`, which makes this layout a single column), and on a phone choosing a row shows the
 * record in place of the list, as before. Pure CSS: which of these applies is decided by the `has()` selectors, so
 * nothing needs to know the screen width and nothing shifts when the page loads.
 */
export function MasterDetail({ list, detail }: { list: ReactNode; detail: ReactNode }) {
  return (
    <div className="group/md xl:grid xl:grid-cols-[minmax(0,1fr)_minmax(26rem,34rem)] xl:items-start xl:gap-6 xl:has-[[data-record-page]]:block">
      <div className="min-w-0 max-xl:group-has-[[data-detail]]/md:hidden">{list}</div>
      <aside aria-label="Selected record" className="min-w-0 group-has-[[data-record-page]]/md:hidden xl:sticky xl:top-20 xl:max-h-[calc(100dvh-6rem)] xl:overflow-y-auto">
        {detail}
      </aside>
    </div>
  );
}

/** What the right-hand side says before anything is chosen. Hidden below xl, where there is no right-hand side. */
export function DetailPlaceholder({ what }: { what: string }) {
  return (
    <div className="hidden rounded-xl border border-dashed bg-card p-6 text-center text-sm text-muted-foreground xl:block">
      Choose {what} from the list to see their record here. Use the up and down arrow keys to move through the list.
    </div>
  );
}

/** The opened record. `data-detail` is what tells the layout to hide the list on a phone. */
export function DetailPane({ backHref, backLabel, children }: { backHref: string; backLabel: string; children: ReactNode }) {
  return (
    <div data-detail className="grid gap-4 xl:rounded-xl xl:border xl:bg-card xl:p-4">
      <Link href={backHref} className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground xl:hidden">
        <ArrowLeft className="size-4" aria-hidden /> {backLabel}
      </Link>
      {children}
    </div>
  );
}
