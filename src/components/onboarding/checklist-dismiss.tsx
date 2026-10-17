"use client";

import { useRouter } from "next/navigation";
import { saveOnboarding } from "@/app/(app)/actions";
import { Button } from "@/components/ui/button";
import { useActionRunner } from "@/components/toast/use-action-runner";

/** Hides the checklist for good. Help can bring it back. */
export function ChecklistDismiss() {
  const router = useRouter();
  const { pending, run } = useActionRunner();
  return (
    <Button
      variant="ghost"
      size="sm"
      disabled={pending}
      onClick={() => run(() => saveOnboarding({ checklistDismissed: true }), { quiet: true, onSuccess: () => router.refresh() })}
    >
      Dismiss
      <span className="sr-only"> getting started checklist</span>
    </Button>
  );
}
