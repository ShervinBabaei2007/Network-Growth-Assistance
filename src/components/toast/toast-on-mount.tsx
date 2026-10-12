"use client";

import { useEffect } from "react";
import type { ToastSpec } from "@/lib/toast";
import { notify } from "./notify";

const shown = new Set<string>();

/**
 * Announces something the server worked out while rendering (a search's result count, a
 * widened date range). Shown once per `spec.key` in this browser tab, so re-renders and
 * refreshes of the same search don't repeat it. The page shows the same facts inline.
 */
export function ToastOnMount({ specs }: { specs: (ToastSpec & { key: string })[] }) {
  const signature = specs.map((s) => s.key).join("|");
  useEffect(() => {
    for (const spec of specs) {
      if (shown.has(spec.key)) continue;
      shown.add(spec.key);
      notify(spec);
    }
    // The keys identify the announcements; the objects are recreated on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);
  return null;
}
