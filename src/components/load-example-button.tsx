"use client";

import { useRouter } from "next/navigation";
import { FlaskConical } from "lucide-react";
import { startSampleData } from "@/app/(app)/actions";
import { useActionRunner } from "@/components/toast/use-action-runner";
import { Button } from "@/components/ui/button";

/** "Load example data" for an empty page. The banner that follows has the one-click Clear. */
export function LoadExampleButton() {
  const router = useRouter();
  const { pending, run } = useActionRunner();
  return (
    <Button type="button" variant="outline" disabled={pending} onClick={() => run(() => startSampleData(), { onSuccess: () => router.refresh() })}>
      <FlaskConical aria-hidden /> {pending ? "Adding example data…" : "Load example data"}
    </Button>
  );
}
