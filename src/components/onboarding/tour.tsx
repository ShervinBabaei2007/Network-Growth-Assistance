"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Popover } from "@base-ui/react/popover";
import { saveOnboarding } from "@/app/(app)/actions";
import { Button } from "@/components/ui/button";
import type { OnboardingState } from "@/lib/onboarding/state";
import { TOUR_STEPS } from "@/lib/onboarding/tour-steps";

const TOTAL = TOUR_STEPS.length;
/** After this long without a stop's target on screen, the stop is shown anyway, pointing at the page heading. */
const TARGET_WAIT_MS = 5000;
/** After this long without a popover, a small "starting" notice makes sure the click visibly did something. */
const NOTICE_AFTER_MS = 400;

function visibleTarget(selector: string): HTMLElement | null {
  const el = document.querySelector<HTMLElement>(selector);
  return el && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== "hidden" ? el : null;
}

/** What a stop points at: its own target, or while that is missing, the page heading. */
function anchorFor(selector: string): HTMLElement {
  return visibleTarget(selector) ?? visibleTarget("main h1") ?? visibleTarget("main") ?? document.body;
}

/** A stop that is on screen: `anchored` once its own target was found, otherwise it points at the heading. */
type Shown = { id: string; anchored: boolean };

/**
 * A guided walk through the app. Each stop opens its page and points at something real on it.
 * It starts when a page is opened with ?tour=1, stays out of the way (non-modal), and can be
 * skipped at any stop. It only navigates; it never changes a record.
 *
 * A stop is never skipped silently: if its target is slow or missing the stop still appears (pointing
 * at the page heading, and moving to its target if that shows up), and a notice covers the wait.
 */
export function ProductTour({ initial }: { initial: OnboardingState }) {
  const params = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const wanted = params.get("tour") === "1";
  const [active, setActive] = useState(false);
  const [index, setIndex] = useState(0);
  // Bumped every time the tour (re)starts, so a restart on the same stop begins its wait again.
  const [run, setRun] = useState(0);
  const [shown, setShown] = useState<Shown | null>(null);
  // The stop the "starting" notice was last raised for.
  const [noticeFor, setNoticeFor] = useState<string | null>(null);
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
      setShown(null);
      pushedFor.current = null;
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
      setShown(null);
      progress.current = { done: false, step: next };
      void saveOnboarding({ tourDone: false, tourStep: next });
    },
    [end],
  );

  // Start, or start over if asked again while running: resume where the user left off, otherwise from the beginning.
  useEffect(() => {
    if (!wanted) return;
    const id = window.setTimeout(() => {
      const { done, step: saved } = progress.current;
      setIndex(!done && saved < TOTAL ? saved : 0);
      setShown(null);
      pushedFor.current = null;
      setRun((n) => n + 1);
      setActive(true);
      // The tour carries on from state now, so the address goes back to the plain page.
      router.replace(window.location.pathname);
    }, 300);
    return () => window.clearTimeout(id);
  }, [wanted, router]);

  // While a stop isn't on screen yet, say so after a moment: the click must never look like it did nothing.
  useEffect(() => {
    if (!active || !step || shown?.id === step.id) return;
    const id = window.setTimeout(() => setNoticeFor(step.id), NOTICE_AFTER_MS);
    return () => window.clearTimeout(id);
  }, [active, step, shown, run]);

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
    const poll = window.setInterval(() => {
      const el = visibleTarget(step.selector);
      if (!el) return;
      window.clearInterval(poll);
      window.clearTimeout(fallback);
      el.scrollIntoView({ block: "nearest" });
      lastAnchor.current = el;
      setShown({ id: step.id, anchored: true });
    }, 150);
    // Slow or missing target (for example hidden at this width): show the stop anyway rather than skip it.
    // Polling carries on, so the popover moves to its target if that appears later.
    const fallback = window.setTimeout(() => setShown((cur) => (cur?.id === step.id ? cur : { id: step.id, anchored: false })), TARGET_WAIT_MS);
    return () => {
      window.clearInterval(poll);
      window.clearTimeout(fallback);
    };
  }, [active, step, pathname, index, run, router, end]);

  if (!active || !step) return null;

  if (shown?.id !== step.id || pathname !== step.href) {
    return noticeFor === step.id ? (
      <div
        role="status"
        className="fixed right-4 bottom-4 z-[70] flex items-center gap-3 rounded-lg bg-popover px-4 py-3 text-sm text-popover-foreground shadow-lg ring-1 ring-foreground/15"
      >
        <span>Starting the tour…</span>
        <Button variant="ghost" size="sm" onClick={() => end(true, 0)}>
          Skip tour
        </Button>
      </div>
    ) : null;
  }

  return (
    <Popover.Root
      key={`${step.id}:${shown.anchored}`}
      open
      modal={false}
      onOpenChange={(open, details) => {
        // Escape ends the tour. Clicking elsewhere on the page does not, so the page stays usable.
        if (!open && details.reason === "escape-key") end(true, 0);
      }}
    >
      <Popover.Portal>
        <Popover.Positioner anchor={() => anchorFor(step.selector)} side="bottom" align="start" sideOffset={10} collisionPadding={12} className="z-[70]">
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
