"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Popover } from "@base-ui/react/popover";
import { saveOnboarding } from "@/app/(app)/actions";
import { Button } from "@/components/ui/button";
import { availableSteps, type OnboardingState, type TourStep } from "@/lib/onboarding/state";

/**
 * Every step points at a real element by a stable data-tour attribute. Steps whose element is
 * missing or hidden on this screen (for example the sidebar on a phone) are dropped.
 */
const STEPS: TourStep[] = [
  { id: "menu", selector: "[data-tour=menu-button]", title: "Your menu", body: "Everything in the app is in this menu, grouped by what you are trying to do." },
  { id: "nav", selector: "[data-tour=nav]", title: "Grouped by goal", body: "Find opportunities, work on your network, track applications, and check insights. Each group answers one question." },
  { id: "primary", selector: "[data-tour=primary-action]", title: "Your next step", body: "The Overview always shows one recommended action. Start here when you are not sure what to do." },
  { id: "discover", selector: "[data-tour=nav-discover]", title: "Find people", body: "Describe who you'd like to meet and Discover looks for real, verifiable matches." },
  { id: "jobs", selector: "[data-tour=nav-jobs]", title: "Find jobs", body: "Search postings and see how well each one fits. Resume, employers and saved searches are on this page." },
  { id: "queue", selector: "[data-tour=nav-queue]", title: "Your daily queue", body: "Approved people to contact today, in order." },
  { id: "bell", selector: "[data-tour=bell]", title: "Notifications", body: "Reminders, interviews and job alerts collect here." },
  { id: "help", selector: "[data-tour=nav-help]", title: "Help any time", body: "Replay this tour or restart the setup guide from Help." },
];

function isVisible(selector: string): boolean {
  const el = document.querySelector<HTMLElement>(selector);
  return !!el && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== "hidden";
}

/** Runs when a page is opened with ?tour=1. Non-blocking: the page stays usable and Skip is always shown. */
export function ProductTour({ initial }: { initial: OnboardingState }) {
  const params = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const wanted = params.get("tour") === "1";
  const [active, setActive] = useState(false);
  const [steps, setSteps] = useState<TourStep[]>([]);
  const [index, setIndex] = useState(initial.tourDone ? 0 : initial.tourStep);
  const nextRef = useRef<HTMLButtonElement>(null);
  const lastAnchor = useRef<HTMLElement | null>(null);

  const refresh = useCallback(() => setSteps(availableSteps(STEPS, isVisible)), []);

  const end = useCallback(
    (completed: boolean, position: number) => {
      setActive(false);
      void saveOnboarding({ tourDone: completed, tourStep: completed ? 0 : position });
      router.replace(pathname);
    },
    [pathname, router],
  );

  useEffect(() => {
    if (!wanted) return;
    // The page may still be streaming in; work out the steps after it paints, and again on resize.
    const id = window.setTimeout(() => {
      const found = availableSteps(STEPS, isVisible);
      // Nothing to point at (every target is hidden): end quietly instead of showing a stray popover.
      if (found.length === 0) return end(true, 0);
      setSteps(found);
      setActive(true);
    }, 300);
    window.addEventListener("resize", refresh);
    return () => {
      window.clearTimeout(id);
      window.removeEventListener("resize", refresh);
    };
  }, [wanted, refresh, end]);

  const step = steps[Math.min(index, Math.max(steps.length - 1, 0))];

  useEffect(() => {
    if (!active || !step) return;
    const el = document.querySelector<HTMLElement>(step.selector);
    el?.scrollIntoView({ block: "nearest" });
    lastAnchor.current = el;
  }, [active, step]);

  if (!active || !step) return null;

  const total = steps.length;
  const pos = Math.min(index, total - 1);
  const go = (to: number) => {
    setIndex(to);
    void saveOnboarding({ tourDone: false, tourStep: to });
  };

  return (
    <Popover.Root
      open
      modal={false}
      onOpenChange={(open, details) => {
        // Escape ends the tour. Clicking elsewhere on the page does not, so the page stays usable.
        if (!open && details.reason === "escape-key") end(true, 0);
      }}
    >
      <Popover.Portal>
        <Popover.Positioner anchor={() => document.querySelector<HTMLElement>(step.selector)} side="bottom" align="start" sideOffset={10} collisionPadding={12} className="z-[70]">
          <Popover.Popup
            data-testid="tour-popover"
            initialFocus={nextRef}
            finalFocus={() => (lastAnchor.current?.isConnected ? lastAnchor.current : null)}
            className="grid w-72 max-w-[calc(100vw-1.5rem)] gap-2 rounded-lg bg-popover p-4 text-sm text-popover-foreground shadow-lg ring-1 ring-foreground/15"
          >
            <p className="text-xs font-medium text-muted-foreground" aria-live="polite">
              Tour step {pos + 1} of {total}
            </p>
            <Popover.Title className="font-semibold">{step.title}</Popover.Title>
            <Popover.Description className="text-muted-foreground">{step.body}</Popover.Description>
            <div className="flex items-center justify-between gap-2 pt-1">
              <Button variant="ghost" size="sm" onClick={() => end(true, 0)}>
                Skip tour
              </Button>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={pos === 0} onClick={() => go(pos - 1)}>
                  Back
                </Button>
                <Button ref={nextRef} size="sm" onClick={() => (pos === total - 1 ? end(true, 0) : go(pos + 1))}>
                  {pos === total - 1 ? "Finish" : "Next"}
                </Button>
              </div>
            </div>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
