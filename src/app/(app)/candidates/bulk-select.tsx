"use client";

import { useRef, useState, useSyncExternalStore } from "react";
import { BanIcon, Check, ClipboardCheck, Trash2, X } from "lucide-react";
import { bulkDeleteCandidates, bulkSetStatus, undoBulkStatus, type BulkStatusChange } from "./bulk-actions";
import { useActionRunner } from "@/components/toast/use-action-runner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { createSelectionStore } from "@/lib/selection";

// One selection for the page; it lives as long as the page does.
const store = createSelectionStore();
const useSelection = () => useSyncExternalStore(store.subscribe, store.getSnapshot, () => []);

/** The tick box at the start of a row. */
export function RowSelect({ id, name }: { id: string; name: string }) {
  const selected = useSelection().includes(id);
  return <Checkbox checked={selected} onCheckedChange={(on) => store.toggle(id, on)} aria-label={`Select ${name}`} />;
}

/** The tick box in the header: selects or clears every row on this page. */
export function SelectAll({ ids }: { ids: string[] }) {
  const selected = useSelection();
  const all = ids.length > 0 && ids.every((id) => selected.includes(id));
  const some = !all && ids.some((id) => selected.includes(id));
  return <Checkbox checked={all} indeterminate={some} onCheckedChange={(on) => store.setMany(ids, on)} aria-label="Select everyone on this page" />;
}

type Status = BulkStatusChange["status"];
const STATUS_BUTTONS: { status: Status; label: string; icon: React.ReactNode }[] = [
  { status: "approved", label: "Approve", icon: <Check aria-hidden /> },
  { status: "awaiting_review", label: "Needs review", icon: <ClipboardCheck aria-hidden /> },
  { status: "not_a_match", label: "Not a match", icon: <X aria-hidden /> },
  { status: "do_not_contact", label: "Do not contact", icon: <BanIcon aria-hidden /> },
];

/** Appears when rows are ticked: one decision for all of them, with Undo. Reachable by keyboard and touch. */
export function BulkBar() {
  const selected = useSelection();
  const { pending, run } = useActionRunner();
  const [confirmDelete, setConfirmDelete] = useState(false);
  // What the last change did, so Undo restores exactly those people.
  const lastChange = useRef<BulkStatusChange | null>(null);
  if (selected.length === 0) return null;

  const setStatus = (status: Status) =>
    run(
      async () => {
        const result = await bulkSetStatus([...selected], status);
        if (result.ok && result.data) {
          lastChange.current = result.data;
          store.clear();
        }
        return result;
      },
      { undo: () => undoBulkStatus(lastChange.current!) },
    );

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
      {confirmDelete ? (
        <>
          <span className="text-destructive">
            Delete {selected.length} {selected.length === 1 ? "person" : "people"} and their invitation records? This can&apos;t be undone.
          </span>
          <Button
            size="sm"
            variant="destructive"
            disabled={pending}
            onClick={() =>
              run(() => bulkDeleteCandidates([...selected]), {
                onSuccess: () => {
                  store.clear();
                  setConfirmDelete(false);
                },
              })
            }
          >
            Delete
          </Button>
          <Button size="sm" variant="outline" onClick={() => setConfirmDelete(false)}>
            Cancel
          </Button>
        </>
      ) : (
        <>
          {STATUS_BUTTONS.map((b) => (
            <Button key={b.status} size="sm" variant="outline" disabled={pending} onClick={() => setStatus(b.status)}>
              {b.icon} {b.label}
            </Button>
          ))}
          <Button size="sm" variant="outline" disabled={pending} onClick={() => setConfirmDelete(true)}>
            <Trash2 aria-hidden /> Delete…
          </Button>
          <Button size="sm" variant="ghost" onClick={() => store.clear()}>
            Clear
          </Button>
        </>
      )}
    </div>
  );
}
