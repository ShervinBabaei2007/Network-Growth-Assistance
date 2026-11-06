"use client";

import { useRouter } from "next/navigation";
import { saveOnboarding } from "@/app/(app)/actions";
import { Button } from "@/components/ui/button";
import { useActionRunner } from "@/components/toast/use-action-runner";
import { useT } from "@/lib/i18n/client";

/** Hides the checklist for good. Help can bring it back. */
export function ChecklistDismiss() {
  const router = useRouter();
  const { pending, run } = useActionRunner();
  const t = useT();
  const tr = (key: "ui.dismiss" | "checklist.dismissHint", fallback: string) => (t(key) === key ? fallback : t(key));
  return (
    <Button
      variant="ghost"
      size="sm"
      disabled={pending}
      onClick={() => run(() => saveOnboarding({ checklistDismissed: true }), { quiet: true, onSuccess: () => router.refresh() })}
    >
      {tr("ui.dismiss", "Dismiss")}
      <span className="sr-only">{tr("checklist.dismissHint", " getting started checklist")}</span>
    </Button>
  );
}
