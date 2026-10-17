import { Suspense } from "react";
import { OnboardingWizard } from "@/components/onboarding/wizard";
import { ProductTour } from "@/components/onboarding/tour";
import { getOnboarding } from "@/lib/onboarding/read";
import { shouldShowWizard } from "@/lib/onboarding/state";

/**
 * Mounted once in the app shell. Shows the welcome only to people who haven't finished or skipped
 * it, and the tour only when a page is opened with ?tour=1. RLS limits the read to the user's own row.
 */
export async function OnboardingLayer() {
  const state = await getOnboarding();
  if (!state) return null;
  // The shell isn't re-rendered on every navigation, so the tour is always mounted and waits for ?tour=1.
  return (
    <>
      {shouldShowWizard(state) ? <OnboardingWizard key={JSON.stringify(state)} initial={state} /> : null}
      <Suspense fallback={null}>
        <ProductTour initial={state} />
      </Suspense>
    </>
  );
}
