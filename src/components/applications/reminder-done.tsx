"use client";

import { Check } from "lucide-react";
import { setReminderDone } from "@/app/(app)/applications/actions";
import { useActionRunner } from "@/components/toast/use-action-runner";
import { Button } from "@/components/ui/button";

/** Marks a reminder done, with Undo. */
export function ReminderDoneButton({ id, text }: { id: string; text: string }) {
  const { pending, run } = useActionRunner();
  return (
    <Button size="xs" variant="outline" disabled={pending} aria-label={`Mark done: ${text}`} onClick={() => run(() => setReminderDone(id, true), { undo: () => setReminderDone(id, false) })}>
      <Check aria-hidden /> Done
    </Button>
  );
}
