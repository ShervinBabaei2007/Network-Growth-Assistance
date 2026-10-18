"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { clearSampleData } from "@/app/(app)/actions";
import { Button } from "@/components/ui/button";
import { useT } from "@/lib/i18n/client";

/** Shown on every page while the demo workspace is on, so example data is never mistaken for the user's own. */
export function SampleDataBanner() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const t = useT();

  return (
    <div role="status" data-testid="sample-banner" className="flex flex-wrap items-center justify-between gap-2 border-b bg-primary/10 px-4 py-2 text-sm">
      <p>
        <strong>{t("banner.sampleTitle")}</strong> {t("banner.sampleText")}
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
        {pending ? t("banner.sampleClearing") : t("banner.sampleClear")}
      </Button>
    </div>
  );
}
