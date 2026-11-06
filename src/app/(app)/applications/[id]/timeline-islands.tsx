"use client";

import { useTr } from "@/lib/i18n/client";
import { useState } from "react";
import { Trash2 } from "lucide-react";
import { AppSelect } from "@/components/app-select";
import { useActionRunner } from "@/components/toast/use-action-runner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { addNote, deleteNote } from "../actions";

/** The only interactive parts of the timeline: the "add a note" form and each note's Remove button. */
export function NoteForm({ applicationId }: { applicationId: string }) {
  const tr = useTr();
  const { pending, run } = useActionRunner();
  const [kind, setKind] = useState<"note" | "response">("note");
  const [text, setText] = useState("");
  const add = () => {
    let id = "";
    run(
      async () => {
        const r = await addNote(applicationId, kind, text);
        if (r.ok) {
          id = r.data?.id ?? "";
          setText("");
        }
        return r;
      },
      { undo: () => deleteNote(id) },
    );
  };
  return (
    <form
      className="grid gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        add();
      }}
    >
      <div className="flex flex-wrap gap-2">
        <div className="grid gap-1">
          <Label htmlFor="note-kind">{tr("msg.typea1fa", tr("msg.typea1fa", "Type"))}</Label>
          <AppSelect id="note-kind" value={kind} onChange={(e) => setKind(e.target.value as "note" | "response")} className="w-40">
            <option value="note">{tr("msg.note3b06", tr("msg.note3b06", "Note"))}</option>
            <option value="response">{tr("msg.responseReceived8bb8", tr("msg.responseReceived8bb8", "Response received"))}</option>
          </AppSelect>
        </div>
      </div>
      <Label htmlFor="note-text" className="sr-only">
        {kind === "note" ? tr("msg.note3b06", "Note") : tr("msg.responsed64e", "Response")}
      </Label>
      <Textarea id="note-text" value={text} maxLength={2000} rows={3} onChange={(e) => setText(e.target.value)} placeholder={kind === "note" ? tr("msg.eGFollowedUp62e0", "e.g. Followed up with the recruiter by email") : tr("msg.eGInvitedTobd24", "e.g. Invited to a phone screen next week")} />
      <Button type="submit" size="sm" className="justify-self-start" disabled={pending || !text.trim()}>
        {tr("msg.addToTimeline257e", tr("msg.addToTimeline257e", "Add to timeline"))}
      </Button>
    </form>
  );
}

export function RemoveEntry({ id, kind }: { id: string; kind: string }) {
  const { pending, run } = useActionRunner();
  const tr = useTr();
  return (
    <Button size="xs" variant="ghost" className="justify-self-start" disabled={pending} onClick={() => run(() => deleteNote(id))} aria-label={kind === "response" ? tr("appRecord.removeResponse", "Remove this response") : tr("appRecord.removeNote", "Remove this note")}>
      <Trash2 aria-hidden /> {tr("msg.remove1063", tr("msg.remove1063", "Remove"))}
    </Button>
  );
}
