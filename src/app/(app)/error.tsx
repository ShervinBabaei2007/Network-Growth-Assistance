"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { useT } from "@/lib/i18n/client";
import { reportClientError } from "@/lib/monitoring/client";

/** Shown when a page in the app throws; the shell and navigation stay usable. */
export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const t = useT();
  useEffect(() => {
    console.error("[app] page error:", error.digest ?? error.message);
    reportClientError(error, error.digest);
  }, [error]);

  return (
    <div role="alert" className="grid max-w-md gap-3 rounded-lg border bg-card p-4">
      <p className="font-medium">{t("pageErrors.pageTitle")}</p>
      <p className="text-sm text-muted-foreground">{t("pageErrors.pageBody")}</p>
      <div>
        <Button onClick={reset}>{t("pageErrors.retry")}</Button>
      </div>
    </div>
  );
}
