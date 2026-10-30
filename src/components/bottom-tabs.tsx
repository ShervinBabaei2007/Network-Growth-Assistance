"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Ellipsis } from "lucide-react";
import { loadSheet, MobileNavSheet, NAV_ITEMS } from "@/components/app-nav";
import { useT } from "@/lib/i18n/client";
import { activeTab, tabHrefs } from "@/lib/mobile-tabs";
import type { Goal } from "@/lib/onboarding/steps";
import { cn } from "@/lib/utils";

const TAB = "flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 rounded-md px-1 text-[0.7rem] leading-tight text-muted-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none";

/**
 * A thumb-reachable bar for the few places used all day, on phones only. It sits beside the header's menu button, not
 * instead of it: the last tab, "More", opens the same full menu, so every destination is still two taps away.
 */
export function BottomTabs({ goal }: { goal?: Goal }) {
  const t = useT();
  const pathname = usePathname();
  const hrefs = tabHrefs(goal);
  const current = activeTab(pathname, hrefs);
  const [wanted, setWanted] = useState(false);
  const [open, setOpen] = useState(false);
  const items = hrefs.flatMap((h) => NAV_ITEMS.filter((i) => i.href === h));
  return (
    <>
      <nav
        aria-label={t("common.quickNavigation")}
        data-testid="bottom-tabs"
        className="fixed inset-x-0 bottom-0 z-40 flex border-t bg-card px-[max(0.25rem,env(safe-area-inset-left))] pb-[env(safe-area-inset-bottom)] md:hidden"
      >
        {items.map((item) => {
          const Icon = item.icon;
          const active = current === item.href;
          return (
            <Link key={item.href} href={item.href} aria-current={active ? "page" : undefined} className={cn(TAB, active && "font-semibold text-primary")}>
              <Icon aria-hidden className="size-5" />
              {t(item.labelKey)}
            </Link>
          );
        })}
        <button
          type="button"
          aria-haspopup="dialog"
          aria-expanded={open}
          className={cn(TAB, current === null && pathname !== null && "font-semibold text-primary")}
          onPointerEnter={() => void loadSheet()}
          onFocus={() => void loadSheet()}
          onClick={() => {
            setWanted(true);
            setOpen(true);
          }}
        >
          <Ellipsis aria-hidden className="size-5" />
          {t("common.more")}
        </button>
      </nav>
      {wanted ? (
        <Suspense fallback={null}>
          <MobileNavSheet goal={goal} open={open} onOpenChange={setOpen} />
        </Suspense>
      ) : null}
    </>
  );
}
