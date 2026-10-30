"use client";

import { useState } from "react";
import { deleteJobNote, saveJobNote } from "../hidden/actions";
import { useActionRunner } from "@/components/toast/use-action-runner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { DraftBanner } from "@/components/draft-banner";
import { useDraft } from "@/hooks/use-draft";
import { draftKey } from "@/lib/drafts";
import { useUnsavedChanges } from "@/hooks/use-unsaved-changes";

/** A private note on this job. Only you can see it. */
export function JobNote({ jobId, initial }: { jobId: string; initial: string }) {
  const [text, setText] = useState(initial);
  const { pending, run } = useActionRunner();
  const dirty = text.trim() !== initial.trim();
  useUnsavedChanges(dirty);
  const draft = useDraft(draftKey("job-note", jobId), text, initial);
  return (
    <div className="grid gap-2">
      {draft.offered !== null ? <DraftBanner what="note" onRestore={() => setText(draft.accept() ?? "")} onDiscard={draft.discard} /> : null}
      <label htmlFor="job-note" className="text-xs font-medium text-muted-foreground">
        Your private note
      </label>
      <Textarea id="job-note" value={text} maxLength={2000} rows={3} onChange={(e) => setText(e.target.value)} placeholder="Questions to ask, pay you heard about, who referred you…" />
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" disabled={pending || !dirty || !text.trim()} onClick={() => run(() => saveJobNote(jobId, text))}>
          Save note
        </Button>
        {initial ? (
          <Button
            size="sm"
            variant="ghost"
            disabled={pending}
            onClick={() => run(() => deleteJobNote(jobId), { undo: () => saveJobNote(jobId, initial), onSuccess: () => setText("") })}
          >
            Delete note
          </Button>
        ) : null}
      </div>
    </div>
  );
}
