"use client";

import { NavLinks } from "@/components/app-nav";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import type { Goal } from "@/lib/onboarding/steps";

/** The phone menu's slide-in panel. Loaded the first time the menu button is used (see MobileNav). */
export default function MobileNavSheet({ goal, open, onOpenChange }: { goal?: Goal; open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="left" className="overflow-y-auto p-4">
        <SheetTitle className="mb-2 px-3">Network Growth</SheetTitle>
        <NavLinks goal={goal} onNavigate={() => onOpenChange(false)} />
      </SheetContent>
    </Sheet>
  );
}
