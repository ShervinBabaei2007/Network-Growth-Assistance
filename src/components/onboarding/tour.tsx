"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Popover } from "@base-ui/react/popover";
import { saveOnboarding } from "@/app/(app)/actions";
import { Button } from "@/components/ui/button";
import type { OnboardingState } from "@/lib/onboarding/state";
import { TOUR_STEPS } from "@/lib/onboarding/tour-steps";

const TOTAL = TOUR_STEPS.length;
/** How long to wait for a page to show the element a stop points at before moving on, unless the stop says otherwise. */
const DEFAULT_WAIT_MS = 6000;

function visibleTarget(selector: string): HTMLElement | null {
  const el = document.querySelector<HTMLElement>(selector);
  return el && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== "hidden" ? el : null;
}

/**
 * A guided walk through the app. Each stop opens its page and points at something real on it.
 * It starts when a page is opened with ?tour=1, stays out of the way (non-modal), and can be
 * skipped at any stop. It only navigates; it never changes a record.
 */
export function ProductTour({ initial }: { initial: OnboardingState }) {
  const params = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const wanted = params.get("tour") === "1";
  const [active, setActive] = useState(false);
  const [index, setIndex] = useState(0);
  // The stop whose target has been found on screen. Anything else shows nothing, so a popover never floats loose.
  const [readyFor, setReadyFor] = useState<string | null>(null);
  const nextRef = useRef<HTMLButtonElement>(null);
  const pushedFor = useRef<string | null>(null);
  const lastAnchor = useRef<HTMLElement | null>(null);
  const step = TOUR_STEPS[index];
  // The layout that supplies `initial` isn't re-rendered on client navigation, so progress made in this
  // session is tracked here; `initial` only re-seeds it when the server sends fresh values (e.g. after a restart).
  const progress = useRef({ done: initial.tourDone, step: initial.tourStep });
  useEffect(() => {
    progress.current = { done: initial.tourDone, step: initial.tourStep };
  }, [initial.tourDone, initial.tourStep]);

  const end = useCallback(
    (completed: boolean, position: number) => {
      setActive(false);
      pushedFor.current = null;
      setReadyFor(null);
      progress.current = { done: completed, step: completed ? 0 : position };
      void saveOnboarding({ tourDone: completed, tourStep: completed ? 0 : position });
      if (new URLSearchParams(window.location.search).has("tour")) router.replace(window.location.pathname);
    },
    [router],
  );

  const go = useCallback(
    (to: number) => {
      if (to >= TOTAL) return end(true, 0);
      const next = Math.max(0, to);
      setIndex(next);
      setReadyFor(null);
      progress.current = { done: false, step: next };
      void saveOnboarding({ tourDone: false, tourStep: next });
    },
    [end],
  );

  // Start: resume where the user left off, otherwise from the beginning.
  useEffect(() => {
    if (!wanted || active) return;
    const id = window.setTimeout(() => {
      const { done, step: saved } = progress.current;
      setIndex(!done && saved < TOTAL ? saved : 0);
      setActive(true);
      // The tour carries on from state now, so the address goes back to the plain page.
      router.replace(window.location.pathname);
    }, 300);
    return () => window.clearTimeout(id);
  }, [wanted, active, router]);

  // Open the stop's page, then wait for its target.
  useEffect(() => {
    if (!active || !step) return;
    if (pathname !== step.href) {
      if (pushedFor.current === step.id) {
        // We already sent them here and they have since gone somewhere else: leave them be.
        const id = window.setTimeout(() => end(false, index), 0);
        return () => window.clearTimeout(id);
      }
      pushedFor.current = step.id;
      router.push(step.href);
      return;
    }
    pushedFor.current = step.id;
    let done = false;
    const finish = (fn: () => void) => {
      if (done) return;
      done = true;
      window.clearInterval(poll);
      window.clearTimeout(giveUp);
      fn();
    };
    const poll = window.setInterval(() => {
      const el = visibleTarget(step.selector);
      if (!el) return;
      finish(() => {
        el.scrollIntoView({ block: "nearest" });
        lastAnchor.current = el;
        setReadyFor(step.id);
      });
    }, 150);
    // The target never showed (for example it is hidden at this width): move on rather than point at nothing.
    const giveUp = window.setTimeout(() => finish(() => go(index + 1)), step.waitMs ?? DEFAULT_WAIT_MS);
    return () => {
      done = true;
      window.clearInterval(poll);
      window.clearTimeout(giveUp);
    };
  }, [active, step, pathname, index, router, end, go]);

  if (!active || !step || readyFor !== step.id || pathname !== step.href) return null;

  return (
    <Popover.Root
      key={step.id}
      open
      modal={false}
      onOpenChange={(open, details) => {
        // Escape ends the tour. Clicking elsewhere on the page does not, so the page stays usable.
        if (!open && details.reason === "escape-key") end(true, 0);
      }}
    >
      <Popover.Portal>
        <Popover.Positioner anchor={() => visibleTarget(step.selector)} side="bottom" align="start" sideOffset={10} collisionPadding={12} className="z-[70]">
          <Popover.Popup
            data-testid="tour-popover"
            initialFocus={nextRef}
            finalFocus={() => (lastAnchor.current?.isConnected ? lastAnchor.current : null)}
            className="grid w-80 max-w-[calc(100vw-1.5rem)] gap-2 rounded-lg bg-popover p-4 text-sm text-popover-foreground shadow-lg ring-1 ring-foreground/15"
          >
            <p className="text-xs font-medium text-muted-foreground" aria-live="polite">
              Stop {index + 1} of {TOTAL}
            </p>
            <Popover.Title className="font-semibold">{step.title}</Popover.Title>
            <Popover.Description className="text-muted-foreground">{step.body}</Popover.Description>
            <div className="flex items-center justify-between gap-2 pt-1">
              <Button variant="ghost" size="sm" onClick={() => end(true, 0)}>
                Skip tour
              </Button>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={index === 0} onClick={() => go(index - 1)}>
                  Back
                </Button>
                <Button ref={nextRef} size="sm" onClick={() => go(index + 1)}>
                  {index === TOTAL - 1 ? "Finish" : "Next"}
                </Button>
              </div>
            </div>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
