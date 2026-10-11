"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";

/** Shown when a page in the app throws; the shell and navigation stay usable. */
export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("[app] page error:", error.digest ?? error.message);
  }, [error]);

  return (
    <div role="alert" className="grid max-w-md gap-3 rounded-lg border bg-card p-4">
      <p className="font-medium">Something went wrong loading this page.</p>
      <p className="text-sm text-muted-foreground">
        Nothing you entered was lost. Try again; if it keeps happening, sign out and back in.
      </p>
      <div>
        <Button onClick={reset}>Try again</Button>
      </div>
    </div>
  );
}
