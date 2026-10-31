import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { PaneSignal } from "@/components/master-detail-shell";

export { MasterDetail, PaneSignal } from "@/components/master-detail-shell";

/** What the right-hand side says before anything is chosen. Hidden below xl, where there is no right-hand side. */
export function DetailPlaceholder({ what }: { what: string }) {
  return (
    <div className="hidden rounded-xl border border-dashed bg-card p-6 text-center text-sm text-muted-foreground xl:block">
      Choose {what} from the list to see their record here. Use the up and down arrow keys to move through the list.
    </div>
  );
}

/** The opened record. `data-detail` is what tells the layout to hide the list on a phone. */
export function DetailPane({ backHref, backLabel, children }: { backHref?: string; backLabel?: string; children: ReactNode }) {
  return (
    <div data-detail className="grid gap-4 xl:rounded-xl xl:border xl:bg-card xl:p-4">
      <PaneSignal kind="detail" />
      {backHref ? (
        <Link href={backHref} className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground xl:hidden">
          <ArrowLeft className="size-4" aria-hidden /> {backLabel}
        </Link>
      ) : null}
      {children}
    </div>
  );
}
