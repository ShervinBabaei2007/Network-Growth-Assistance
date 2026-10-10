"use client";

import { useState } from "react";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

/** Editable connection note with a live character count against the user's limit. */
export function NoteField({ id, defaultValue, limit }: { id: string; defaultValue: string; limit: number }) {
  const [value, setValue] = useState(defaultValue);
  const over = value.length > limit;
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>Note you&apos;ll send (optional)</Label>
      <Textarea id={id} name="note" rows={3} value={value} onChange={(e) => setValue(e.target.value)} maxLength={1000} aria-describedby={`${id}-count`} />
      <p id={`${id}-count`} className={cn("text-xs", over ? "text-destructive" : "text-muted-foreground")}>
        {value.length} / {limit} characters{over ? " — LinkedIn will cut this off" : ""}
      </p>
    </div>
  );
}
