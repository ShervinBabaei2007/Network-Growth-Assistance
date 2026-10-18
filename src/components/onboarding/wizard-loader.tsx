"use client";

import dynamic from "next/dynamic";
import type { OnboardingState } from "@/lib/onboarding/steps";

// The welcome's code (dialog and all) is only fetched for people who are actually shown it.
const OnboardingWizard = dynamic(() => import("@/components/onboarding/wizard").then((m) => m.OnboardingWizard));

export function WizardLoader({ initial }: { initial: OnboardingState }) {
  return <OnboardingWizard initial={initial} />;
}
