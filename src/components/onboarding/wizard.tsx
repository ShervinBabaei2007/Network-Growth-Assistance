"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Briefcase, Compass, Users } from "lucide-react";
import { saveOnboarding, startSampleData } from "@/app/(app)/actions";
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
import { useT } from "@/lib/i18n/client";
import type { MessageKey } from "@/lib/i18n/core";
import { TOUR_STEPS } from "@/lib/onboarding/tour-steps";
import { cn } from "@/lib/utils";

const GOAL_OPTIONS: { value: Goal; label: MessageKey; detail: MessageKey; icon: typeof Users }[] = [
  { value: "network", label: "welcome.goalNetwork", detail: "welcome.goalNetworkDetail", icon: Users },
  { value: "jobs", label: "welcome.goalJobs", detail: "welcome.goalJobsDetail", icon: Briefcase },
  { value: "both", label: "welcome.goalBoth", detail: "welcome.goalBothDetail", icon: Compass },
];

const TITLES: MessageKey[] = ["welcome.title0", "welcome.title1", "welcome.title2", "welcome.title3"];

/**
 * The first-run welcome. Four short steps, every one skippable. It only navigates and saves the
 * user's own progress; it never creates or changes records.
 */
export function OnboardingWizard({ initial }: { initial: OnboardingState }) {
  const router = useRouter();
  const t = useT();
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

  const [sampleError, setSampleError] = useState<string | null>(null);
  const [sampling, setSampling] = useState(false);

  async function lookAround() {
    setSampling(true);
    setSampleError(null);
    const result = await startSampleData();
    setSampling(false);
    if (!result.ok) {
      setSampleError(result.error);
      return;
    }
    setOpen(false);
    router.push("/overview?tour=1");
    router.refresh();
  }

  const action = firstActionFor(state.goal);
  const actionText: { label: MessageKey; why: MessageKey } =
    state.goal === "jobs"
      ? { label: "welcome.actionResume", why: "welcome.actionResumeWhy" }
      : { label: "welcome.actionDiscover", why: state.goal === "network" ? "welcome.actionDiscoverWhy" : "welcome.actionDiscoverBothWhy" };
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
            {t("welcome.stepOf", { step: step + 1, total: WIZARD_STEPS })}
          </p>
          <div
            role="progressbar"
            aria-label={t("welcome.setupProgress")}
            aria-valuemin={1}
            aria-valuemax={WIZARD_STEPS}
            aria-valuenow={step + 1}
            aria-valuetext={t("welcome.stepOf", { step: step + 1, total: WIZARD_STEPS })}
            className="h-1.5 overflow-hidden rounded-full bg-muted"
          >
            <div className="h-full bg-primary transition-[width] duration-200" style={{ width: `${((step + 1) / WIZARD_STEPS) * 100}%` }} />
          </div>
        </div>

        <DialogTitle>{t(TITLES[step]!)}</DialogTitle>

        {step === 0 ? (
          <div className="grid gap-3">
            <DialogDescription>{t("welcome.intro")}</DialogDescription>
            <ul className="grid gap-2">
              <li>{t("welcome.bullet1")}</li>
              <li>{t("welcome.bullet2")}</li>
              <li>{t("welcome.bullet3")}</li>
            </ul>
          </div>
        ) : null}

        {step === 1 ? (
          <fieldset className="grid gap-2">
            <legend className="sr-only">{t("welcome.primaryGoal")}</legend>
            <DialogDescription>{t("welcome.pickOne")}</DialogDescription>
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
                    {t(label)}
                  </span>
                  <span className="text-muted-foreground">{t(detail)}</span>
                </span>
              </label>
            ))}
            <div className="grid gap-1 border-t pt-3">
              <Button type="button" variant="outline" className="w-fit" disabled={sampling} onClick={() => void lookAround()}>
                {sampling ? t("welcome.addingExamples") : t("welcome.lookAround")}
              </Button>
              <p className="text-xs text-muted-foreground">
                {t("welcome.lookAroundHint")}
              </p>
              {sampleError ? <p role="alert" className="text-xs text-destructive">{sampleError}</p> : null}
            </div>
          </fieldset>
        ) : null}

        {step === 2 ? (
          <div className="grid gap-3">
            <DialogDescription>
              {state.goal === "jobs" ? t("welcome.planJobs") : t("welcome.planNetwork")}
            </DialogDescription>
            <Button
              variant="outline"
              className="w-fit"
              onClick={() => void close(goToStep(state, 3), state.goal === "jobs" ? "/settings" : "/settings#plan")}
            >
              {state.goal === "jobs" ? t("welcome.openSettings") : t("welcome.setUpPlan")}
            </Button>
          </div>
        ) : null}

        {step === 3 ? (
          <div className="grid gap-3">
            <DialogDescription>{t(actionText.why)}</DialogDescription>
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => void close(finish(state), action.href)}>{t(actionText.label)}</Button>
              <Button variant="outline" onClick={() => void close({ ...finish(state), tourStep: 0, tourDone: false }, "/overview?tour=1")}>
                {t("welcome.takeTour", { count: TOUR_STEPS.length })}
              </Button>
            </div>
          </div>
        ) : null}

        {saveFailed ? (
          <p role="alert" className="text-xs text-destructive">
            {t("welcome.saveFailed")}
          </p>
        ) : null}

        <div className="flex items-center justify-between gap-2 border-t pt-3">
          <Button variant="ghost" onClick={() => void close(skip(state))}>
            {t("common.skip")}
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" disabled={step === 0} onClick={() => void persist(goToStep(state, step - 1))}>
              {t("common.back")}
            </Button>
            {last ? (
              <Button variant="secondary" onClick={() => void close(finish(state))}>
                {t("common.done")}
              </Button>
            ) : (
              <Button onClick={() => void persist(goToStep(state, step + 1))}>{t("common.next")}</Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
