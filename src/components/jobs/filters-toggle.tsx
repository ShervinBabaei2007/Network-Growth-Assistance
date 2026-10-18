"use client";

import { useId, useState, type ReactNode } from "react";
import { ChevronDown, SlidersHorizontal } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Filters on a phone: a "Filters" button under the search box that opens them in place, instead of leaving them
 * below 25 results. From lg up the panel is always shown (a sidebar) and the button is hidden. The panel is rendered
 * once, so its fields keep their ids and labels, and it still submits as an ordinary GET form.
 */
export function FiltersToggle({ count, className, children }: { count: number; className?: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  return (
    <div className={cn("grid gap-3", className)}>
      <Button variant="outline" className="w-full justify-between lg:hidden" aria-expanded={open} aria-controls={panelId} onClick={() => setOpen((o) => !o)}>
        <span className="flex items-center gap-2">
          <SlidersHorizontal aria-hidden /> Filters
          {count ? <Badge>{count}</Badge> : null}
        </span>
        <ChevronDown aria-hidden className={cn("transition-transform", open && "rotate-180")} />
      </Button>
      <div id={panelId} className={cn("lg:block", open ? "block" : "hidden")}>
        {children}
      </div>
    </div>
  );
}
