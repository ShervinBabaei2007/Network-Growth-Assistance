"use client";

import { Button } from "@/components/ui/button";

/** "You have an unsaved draft": offered after a crash or accidental close, with a clear way to keep or drop it. */
export function DraftBanner({ onRestore, onDiscard, what = "draft" }: { onRestore: () => void; onDiscard: () => void; what?: string }) {
  return (
    <div role="status" data-testid="draft-banner" className="flex flex-wrap items-center gap-2 rounded-md border border-dashed bg-muted/50 px-3 py-2 text-sm">
      <p className="mr-auto">
        You have an unsaved {what} from earlier on this device.
      </p>
      <Button type="button" size="xs" onClick={onRestore}>
        Restore it
      </Button>
      <Button type="button" size="xs" variant="ghost" onClick={onDiscard}>
        Discard
      </Button>
    </div>
  );
}
