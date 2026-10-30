"use client";

import { useSyncExternalStore } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { createSelectionStore, type SelectionStore } from "@/lib/selection";

/**
 * Multi-select shared by every list that has bulk actions. Each list names its own scope ("candidates",
 * "people", "applications") so ticks on one page never leak into another; a scope's selection lives as long as
 * the page does. The row cap is enforced by the store and again by each server action.
 */
const stores = new Map<string, SelectionStore>();
export function bulkStore(scope: string): SelectionStore {
  let s = stores.get(scope);
  if (!s) {
    s = createSelectionStore();
    stores.set(scope, s);
  }
  return s;
}

const NONE: readonly string[] = [];
export function useBulkSelection(scope: string) {
  const store = bulkStore(scope);
  const selected = useSyncExternalStore(store.subscribe, store.getSnapshot, () => NONE);
  return { selected, store };
}

/** The tick box at the start of a row. */
export function RowSelect({ scope, id, name }: { scope: string; id: string; name: string }) {
  const { selected, store } = useBulkSelection(scope);
  return <Checkbox checked={selected.includes(id)} onCheckedChange={(on) => store.toggle(id, on)} aria-label={`Select ${name}`} />;
}

/** The tick box in the header: selects or clears every row on this page. */
export function SelectAll({ scope, ids, label = "Select everything on this page" }: { scope: string; ids: string[]; label?: string }) {
  const { selected, store } = useBulkSelection(scope);
  const all = ids.length > 0 && ids.every((id) => selected.includes(id));
  const some = !all && ids.some((id) => selected.includes(id));
  return <Checkbox checked={all} indeterminate={some} onCheckedChange={(on) => store.setMany(ids, on)} aria-label={label} />;
}

/** The sticky bar that appears when rows are ticked. Reachable by keyboard and by touch. */
export function BulkBarFrame({ scope, children }: { scope: string; children: React.ReactNode }) {
  const { selected } = useBulkSelection(scope);
  if (selected.length === 0) return null;
  return (
    <div
      role="region"
      aria-label="Bulk actions"
      className="sticky bottom-3 z-30 flex flex-wrap items-center gap-2 rounded-xl border bg-popover p-2 pl-3 text-sm shadow-lg"
      data-testid="bulk-bar"
    >
      <p className="mr-auto font-medium" aria-live="polite">
        {selected.length} selected
      </p>
      {children}
    </div>
  );
}
