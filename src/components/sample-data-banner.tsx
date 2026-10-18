"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { clearSampleData } from "@/app/(app)/actions";
import { Button } from "@/components/ui/button";

/** Shown on every page while the demo workspace is on, so example data is never mistaken for the user's own. */
export function SampleDataBanner() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div role="status" data-testid="sample-banner" className="flex flex-wrap items-center justify-between gap-2 border-b bg-primary/10 px-4 py-2 text-sm">
      <p>
        <strong>You&apos;re looking at example data.</strong> The people, applications and numbers are made up.
        {error ? <span className="ml-2 text-destructive">{error}</span> : null}
      </p>
      <Button
        size="sm"
        variant="outline"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const result = await clearSampleData();
            if (result.ok) router.refresh();
            else setError(result.error);
          })
        }
      >
        {pending ? "Clearing…" : "Clear sample data"}
      </Button>
    </div>
  );
}
