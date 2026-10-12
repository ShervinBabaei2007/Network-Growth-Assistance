"use client";

import { Bookmark } from "lucide-react";
import { setJobStatus } from "@/app/(app)/jobs/actions";
import { useActionRunner } from "@/components/toast/use-action-runner";
import { Button } from "@/components/ui/button";

/** Save or unsave from a job card, with Undo in the toast. */
export function SaveJobButton({ jobId, status }: { jobId: string; status: "saved" | "applied" | "dismissed" | null }) {
  const { pending, run } = useActionRunner();
  if (status === "applied") return null;
  const saved = status === "saved";
  return (
    <Button
      size="sm"
      variant="ghost"
      disabled={pending}
      aria-pressed={saved}
      onClick={() => run(() => setJobStatus(jobId, saved ? null : "saved"), { undo: () => setJobStatus(jobId, status) })}
    >
      <Bookmark aria-hidden className={saved ? "fill-current" : undefined} /> {saved ? "Saved" : "Save"}
    </Button>
  );
}
