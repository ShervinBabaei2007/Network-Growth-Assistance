"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import { Columns2 } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { MAX_COMPARE } from "@/lib/job-postings/compare-jobs";
import { createSelectionStore } from "@/lib/selection";

// One selection for the page; it lives as long as the page does.
const store = createSelectionStore();
const NONE: readonly string[] = [];
const useSelection = () => useSyncExternalStore(store.subscribe, store.getSnapshot, () => NONE);

/** "Compare" tick box on a job card. A fourth job can be ticked only after one is cleared. */
export function CompareToggle({ id, title }: { id: string; title: string }) {
  const selected = useSelection();
  const on = selected.includes(id);
  return (
    <label className="inline-flex min-h-8 cursor-pointer items-center gap-1.5 text-xs text-muted-foreground">
      <Checkbox
        checked={on}
        disabled={!on && selected.length >= MAX_COMPARE}
        onCheckedChange={(next) => store.toggle(id, next)}
        aria-label={`Compare ${title}`}
      />
      Compare
    </label>
  );
}

/** Appears once a job is ticked; Compare is offered from two. */
export function CompareBar() {
  const selected = useSelection();
  if (selected.length === 0) return null;
  const ready = selected.length >= 2;
  return (
    <div role="region" aria-label="Compare jobs" className="sticky bottom-3 z-30 flex flex-wrap items-center gap-2 rounded-xl border bg-popover p-2 pl-3 text-sm shadow-lg" data-testid="compare-bar">
      <p className="mr-auto font-medium" aria-live="polite">
        {selected.length} of {MAX_COMPARE} selected{ready ? "" : ": pick at least one more"}
      </p>
      {ready ? (
        <Link href={`/jobs/compare?ids=${selected.join(",")}`} className={buttonVariants({ size: "sm" })}>
          <Columns2 aria-hidden /> Compare
        </Link>
      ) : null}
      <Button size="sm" variant="ghost" onClick={() => store.clear()}>
        Clear
      </Button>
    </div>
  );
}
