"use client";

import { removeOwnAiKey } from "@/app/(app)/jobs/actions";
import { useActionRunner } from "@/components/toast/use-action-runner";
import { Button } from "@/components/ui/button";

export function RemoveAiKeyButton() {
  const { pending, run } = useActionRunner();
  return (
    <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => removeOwnAiKey())}>
      Remove key
    </Button>
  );
}
