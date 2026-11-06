"use client";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { TERM_BUTTON } from "@/components/term-popover";

/** Loaded on first use: the popover library is too heavy to ship with every page that has a status word. */
export default function TermPopoverImpl({ label, definition, ariaLabel, children }: { label: string; definition: string; ariaLabel: string; children?: React.ReactNode }) {
  return (
    <Popover defaultOpen>
      <PopoverTrigger className={TERM_BUTTON} aria-label={ariaLabel} autoFocus>
        {children ?? label}
      </PopoverTrigger>
      <PopoverContent>
        <p className="font-medium">{label}</p>
        <p className="mt-1 text-muted-foreground">{definition}</p>
      </PopoverContent>
    </Popover>
  );
}
