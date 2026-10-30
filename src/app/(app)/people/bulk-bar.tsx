"use client";

import { useRef, useState } from "react";
import { BellOff, Check, Send, Tag, Trash2 } from "lucide-react";
import { BulkBarFrame, useBulkSelection } from "@/components/bulk/bulk-select";
import { useActionRunner } from "@/components/toast/use-action-runner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  bulkAddPersonTag,
  bulkDeletePeople,
  bulkSetPersonStatus,
  bulkSnoozePeople,
  undoBulkPersonStatus,
  undoBulkPersonTag,
  undoBulkSnoozePeople,
  type PersonSnoozeChange,
  type PersonStatusChange,
  type PersonTagChange,
} from "./bulk-actions";

const SCOPE = "people";

/** Appears when people are ticked: one change for all of them, with Undo. Reachable by keyboard and touch. */
export function PeopleBulkBar() {
  const { selected, store } = useBulkSelection(SCOPE);
  const { pending, run } = useActionRunner();
  const [mode, setMode] = useState<"actions" | "tag" | "delete">("actions");
  const [tag, setTag] = useState("");
  // What the last change did, so Undo restores exactly those people.
  const statusChange = useRef<PersonStatusChange | null>(null);
  const tagChange = useRef<PersonTagChange | null>(null);
  const snoozeChange = useRef<PersonSnoozeChange | null>(null);
  if (selected.length === 0) return null;
  const ids = [...selected];

  const setStatus = (status: string) =>
    run(
      async () => {
        const r = await bulkSetPersonStatus(ids, status);
        if (r.ok && r.data) {
          statusChange.current = r.data;
          store.clear();
        }
        return r;
      },
      { undo: () => undoBulkPersonStatus(statusChange.current!) },
    );

  const addTag = () =>
    run(
      async () => {
        const r = await bulkAddPersonTag(ids, tag);
        if (r.ok && r.data) {
          tagChange.current = r.data;
          store.clear();
          setTag("");
          setMode("actions");
        }
        return r;
      },
      { undo: () => undoBulkPersonTag(tagChange.current!) },
    );

  const snooze = () =>
    run(
      async () => {
        const r = await bulkSnoozePeople(ids, 7);
        if (r.ok && r.data) {
          snoozeChange.current = r.data;
          store.clear();
        }
        return r;
      },
      { undo: () => undoBulkSnoozePeople(snoozeChange.current!) },
    );

  return (
    <BulkBarFrame scope={SCOPE}>
      {mode === "delete" ? (
        <>
          <span className="text-destructive">
            Delete {selected.length} {selected.length === 1 ? "person" : "people"} and their notes? This can&apos;t be undone.
          </span>
          <Button
            size="sm"
            variant="destructive"
            disabled={pending}
            onClick={() =>
              run(() => bulkDeletePeople(ids), {
                onSuccess: () => {
                  store.clear();
                  setMode("actions");
                },
              })
            }
          >
            Delete
          </Button>
          <Button size="sm" variant="outline" onClick={() => setMode("actions")}>
            Cancel
          </Button>
        </>
      ) : mode === "tag" ? (
        <form
          className="flex flex-wrap items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            addTag();
          }}
        >
          <Input value={tag} onChange={(e) => setTag(e.target.value)} placeholder="Tag to add" maxLength={40} aria-label="Tag to add" className="h-8 w-40" autoFocus />
          <Button type="submit" size="sm" disabled={pending || !tag.trim()}>
            Add tag
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={() => setMode("actions")}>
            Cancel
          </Button>
        </form>
      ) : (
        <>
          <Button size="sm" variant="outline" disabled={pending} onClick={() => setStatus("ready_to_connect")}>
            <Check aria-hidden /> Ready to connect
          </Button>
          <Button size="sm" variant="outline" disabled={pending} onClick={() => setStatus("connection_sent_manually")}>
            <Send aria-hidden /> Mark sent
          </Button>
          <Button size="sm" variant="outline" disabled={pending} onClick={() => setMode("tag")}>
            <Tag aria-hidden /> Add tag…
          </Button>
          <Button size="sm" variant="outline" disabled={pending} onClick={snooze}>
            <BellOff aria-hidden /> Snooze 7 days
          </Button>
          <Button size="sm" variant="outline" disabled={pending} onClick={() => setMode("delete")}>
            <Trash2 aria-hidden /> Delete…
          </Button>
          <Button size="sm" variant="ghost" onClick={() => store.clear()}>
            Clear
          </Button>
        </>
      )}
    </BulkBarFrame>
  );
}
