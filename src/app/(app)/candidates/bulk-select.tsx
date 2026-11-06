"use client";

import { useRef, useState } from "react";
import { BanIcon, Check, ClipboardCheck, Trash2, X } from "lucide-react";
import { bulkDeleteCandidates, bulkSetStatus, undoBulkStatus, type BulkStatusChange } from "./bulk-actions";
import { useActionRunner } from "@/components/toast/use-action-runner";
import { Button } from "@/components/ui/button";
import { BulkBarFrame, useBulkSelection } from "@/components/bulk/bulk-select";
import { useTr } from "@/lib/i18n/client";

const SCOPE = "candidates";

type Status = BulkStatusChange["status"];
const STATUS_BUTTONS: { status: Status; key: "bulkApprove" | "bulkReview" | "bulkNotMatch" | "bulkDoNotContact"; fallback: string; icon: React.ReactNode }[] = [
  { status: "approved", key: "bulkApprove", fallback: "Approve", icon: <Check aria-hidden /> },
  { status: "awaiting_review", key: "bulkReview", fallback: "Needs review", icon: <ClipboardCheck aria-hidden /> },
  { status: "not_a_match", key: "bulkNotMatch", fallback: "Not a match", icon: <X aria-hidden /> },
  { status: "do_not_contact", key: "bulkDoNotContact", fallback: "Do not contact", icon: <BanIcon aria-hidden /> },
];

/** Appears when rows are ticked: one decision for all of them, with Undo. Reachable by keyboard and touch. */
export function BulkBar() {
  const { selected, store } = useBulkSelection(SCOPE);
  const { pending, run } = useActionRunner();
  const tr = useTr();
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
    <BulkBarFrame scope={SCOPE}>
      {confirmDelete ? (
        <>
          <span className="text-destructive">
            {selected.length === 1
              ? tr("candidatesPage.confirmDeleteOne", "Delete 1 person and their invitation records? This can't be undone.")
              : tr("candidatesPage.confirmDeleteMany", "Delete {count} people and their invitation records? This can't be undone.", { count: selected.length })}
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
            {tr("list.delete", "Delete")}
          </Button>
          <Button size="sm" variant="outline" onClick={() => setConfirmDelete(false)}>
            {tr("list.cancel", "Cancel")}
          </Button>
        </>
      ) : (
        <>
          {STATUS_BUTTONS.map((b) => (
            <Button key={b.status} size="sm" variant="outline" disabled={pending} onClick={() => setStatus(b.status)}>
              {b.icon} {tr(`candidatesPage.${b.key}`, b.fallback)}
            </Button>
          ))}
          <Button size="sm" variant="outline" disabled={pending} onClick={() => setConfirmDelete(true)}>
            <Trash2 aria-hidden /> {tr("list.deleteEllipsis", "Delete…")}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => store.clear()}>
            {tr("list.clearSelection", "Clear")}
          </Button>
        </>
      )}
    </BulkBarFrame>
  );
}
