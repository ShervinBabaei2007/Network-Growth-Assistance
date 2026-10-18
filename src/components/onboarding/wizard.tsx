"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Briefcase, Compass, Users } from "lucide-react";
import { saveOnboarding } from "@/app/(app)/actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import {
  finish,
  firstActionFor,
  goToStep,
  skip,
  WIZARD_STEPS,
  type Goal,
  type OnboardingState,
} from "@/lib/onboarding/steps";
import { TOUR_STEPS } from "@/lib/onboarding/tour-steps";
import { cn } from "@/lib/utils";

const GOAL_OPTIONS: { value: Goal; label: string; detail: string; icon: typeof Users }[] = [
  { value: "network", label: "Grow my network", detail: "Meet people at the schools and in the fields you choose.", icon: Users },
  { value: "jobs", label: "Find a job", detail: "Search postings, tailor your resume and track applications.", icon: Briefcase },
  { value: "both", label: "Both", detail: "Use the whole app. You can change this later.", icon: Compass },
];

const TITLES = ["Welcome to Network Growth", "What do you want to do first?", "Set up your plan (optional)", "Your first step"];

/**
 * The first-run welcome. Four short steps, every one skippable. It only navigates and saves the
 * user's own progress; it never creates or changes records.
 */
export function OnboardingWizard({ initial }: { initial: OnboardingState }) {
  const router = useRouter();
  const [state, setState] = useState<OnboardingState>(initial);
  const [open, setOpen] = useState(true);
  const [saveFailed, setSaveFailed] = useState(false);
  const step = state.step;

  async function persist(next: OnboardingState) {
    setState(next);
    try {
      const result = await saveOnboarding(next);
      setSaveFailed(!result.ok);
      return result.ok;
    } catch {
      setSaveFailed(true);
      return false;
    }
  }

  // Closes only once the save has worked, so a failure is shown rather than vanishing with the dialog.
  // If it already failed once, the next try closes anyway: nobody is trapped behind a broken connection.
  async function close(next: OnboardingState, href?: string) {
    const alreadyFailed = saveFailed;
    const saved = await persist(next);
    if (!saved && !alreadyFailed) return;
    setOpen(false);
    // The menu depends on the chosen goal, and the shell isn't re-rendered by navigation alone.
    if (href) router.push(href);
    router.refresh();
  }

  const action = firstActionFor(state.goal);
  const last = step === WIZARD_STEPS - 1;

  return (
    <Dialog
      open={open}
      // Escape counts as "skip for now". Clicking outside does nothing, so the welcome isn't dismissed by accident.
      onOpenChange={(next, details) => {
        if (!next && details.reason !== "outside-press") void close(skip(state));
      }}
      disablePointerDismissal
    >
      <DialogContent data-testid="onboarding-wizard">
        <div className="grid gap-1.5">
          <p className="text-xs font-medium text-muted-foreground" data-testid="onboarding-progress">
            Step {step + 1} of {WIZARD_STEPS}
          </p>
          <div
            role="progressbar"
            aria-label="Setup progress"
            aria-valuemin={1}
            aria-valuemax={WIZARD_STEPS}
            aria-valuenow={step + 1}
            aria-valuetext={`Step ${step + 1} of ${WIZARD_STEPS}`}
            className="h-1.5 overflow-hidden rounded-full bg-muted"
          >
            <div className="h-full bg-primary transition-[width] duration-200" style={{ width: `${((step + 1) / WIZARD_STEPS) * 100}%` }} />
          </div>
        </div>

        <DialogTitle>{TITLES[step]}</DialogTitle>

        {step === 0 ? (
          <div className="grid gap-3">
            <DialogDescription>
              One place to grow a professional network on purpose and keep your job search organized.
            </DialogDescription>
            <ul className="grid gap-2">
              <li><strong>Find people worth meeting</strong>, using real, checkable sources.</li>
              <li><strong>Track your outreach</strong> against targets you set.</li>
              <li><strong>Find jobs and track applications</strong> in one list.</li>
            </ul>
          </div>
        ) : null}

        {step === 1 ? (
          <fieldset className="grid gap-2">
            <legend className="sr-only">Primary goal</legend>
            <DialogDescription>
              Pick one. It decides what we suggest first; nothing is hidden from you.
            </DialogDescription>
            {GOAL_OPTIONS.map(({ value, label, detail, icon: Icon }) => (
              <label
                key={value}
                className={cn(
                  "flex cursor-pointer items-start gap-3 rounded-lg border p-3 has-focus-visible:ring-3 has-focus-visible:ring-ring/50",
                  state.goal === value && "border-primary bg-primary/5",
                )}
              >
                <input
                  type="radio"
                  name="goal"
                  value={value}
                  checked={state.goal === value}
                  onChange={() => void persist({ ...state, goal: value, status: "in_progress" })}
                  className="mt-1 size-4 accent-primary"
                />
                <span className="grid gap-0.5">
                  <span className="flex items-center gap-1.5 font-medium">
                    <Icon className="size-4" aria-hidden />
                    {label}
                  </span>
                  <span className="text-muted-foreground">{detail}</span>
                </span>
              </label>
            ))}
          </fieldset>
        ) : null}

        {step === 2 ? (
          <div className="grid gap-3">
            <DialogDescription>
              {state.goal === "jobs"
                ? "Optional: tell the app which job titles and places to search. You can also do this later in Settings."
                : "Optional: add the schools and disciplines you want to connect with, and a connection goal. Nothing is assumed until you do, and you can do it later in Settings."}
            </DialogDescription>
            <Button
              variant="outline"
              className="w-fit"
              onClick={() => void close(goToStep(state, 3), state.goal === "jobs" ? "/settings" : "/settings#plan")}
            >
              {state.goal === "jobs" ? "Open Settings" : "Set up my plan"}
            </Button>
          </div>
        ) : null}

        {step === 3 ? (
          <div className="grid gap-3">
            <DialogDescription>{action.why}</DialogDescription>
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => void close(finish(state), action.href)}>{action.label}</Button>
              <Button variant="outline" onClick={() => void close({ ...finish(state), tourStep: 0, tourDone: false }, "/overview?tour=1")}>
                Take the tour ({TOUR_STEPS.length} stops)
              </Button>
            </div>
          </div>
        ) : null}

        {saveFailed ? (
          <p role="alert" className="text-xs text-destructive">
            Couldn&apos;t save your progress. Try again, or choose it a second time to continue anyway; the welcome may show again next time.
          </p>
        ) : null}

        <div className="flex items-center justify-between gap-2 border-t pt-3">
          <Button variant="ghost" onClick={() => void close(skip(state))}>
            Skip
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" disabled={step === 0} onClick={() => void persist(goToStep(state, step - 1))}>
              Back
            </Button>
            {last ? (
              <Button variant="secondary" onClick={() => void close(finish(state))}>
                Done
              </Button>
            ) : (
              <Button onClick={() => void persist(goToStep(state, step + 1))}>Next</Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
