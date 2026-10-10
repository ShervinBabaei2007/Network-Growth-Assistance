"use client";

import { useState, useTransition } from "react";
import { Check, Copy, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { suggestNoteWithClaude } from "./actions";

/**
 * The note you'll paste into LinkedIn: editable, with a live character count, a copy
 * button, an optional Claude rewrite, and a warning when your monthly notes run out.
 */
export function NoteField({
  id,
  queueId,
  defaultValue,
  limit,
  aiEnabled,
  notesLeft,
}: {
  id: string;
  queueId: string;
  defaultValue: string;
  limit: number;
  aiEnabled: boolean;
  /** Personalized notes left this month, or null if the allowance isn't set. */
  notesLeft: number | null;
}) {
  const [value, setValue] = useState(notesLeft === 0 ? "" : defaultValue);
  const [copied, setCopied] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const over = value.length > limit;

  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>Note you&apos;ll send (optional)</Label>
      {notesLeft === 0 ? (
        <p className="text-xs text-muted-foreground">
          You&apos;ve used this month&apos;s personalized notes. Send the invitation without a note;
          it still works.
        </p>
      ) : null}
      <Textarea
        id={id}
        name="note"
        rows={3}
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          setCopied(false);
        }}
        maxLength={1000}
        aria-describedby={`${id}-count`}
      />
      <div className="flex flex-wrap items-center gap-2">
        <p id={`${id}-count`} className={cn("text-xs", over ? "text-destructive" : "text-muted-foreground")}>
          {value.length} / {limit} characters{over ? " — LinkedIn will cut this off" : ""}
          {notesLeft !== null && notesLeft > 0 ? ` · ${notesLeft} note${notesLeft === 1 ? "" : "s"} left this month` : ""}
        </p>
        <Button
          type="button"
          variant="ghost"
          size="xs"
          disabled={!value}
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(value);
              setCopied(true);
            } catch {
              setMessage("Copy isn't available here; select the text instead.");
            }
          }}
        >
          {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
          {copied ? "Copied" : "Copy"}
        </Button>
        {aiEnabled && notesLeft !== 0 ? (
          <Button
            type="button"
            variant="ghost"
            size="xs"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                setMessage(null);
                const r = await suggestNoteWithClaude(queueId);
                if (r.ok) {
                  setValue(r.text);
                  setCopied(false);
                } else {
                  setMessage(r.message);
                }
              })
            }
          >
            <Sparkles aria-hidden />
            {pending ? "Writing…" : "Suggest with Claude"}
          </Button>
        ) : null}
        {value ? (
          <Button type="button" variant="ghost" size="xs" onClick={() => setValue("")}>
            Clear
          </Button>
        ) : null}
      </div>
      {message ? (
        <p role="status" className="text-xs text-muted-foreground">
          {message}
        </p>
      ) : null}
    </div>
  );
}
