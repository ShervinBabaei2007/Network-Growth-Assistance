import { Suspense } from "react";
import { OnboardingWizard } from "@/components/onboarding/wizard";
import { ProductTour } from "@/components/onboarding/tour";
import { parseOnboarding, shouldShowWizard } from "@/lib/onboarding/state";
import { createClient } from "@/lib/supabase/server";

/**
 * Mounted once in the app shell. Shows the welcome only to people who haven't finished or skipped
 * it, and the tour only when a page is opened with ?tour=1. RLS limits the read to the user's own row.
 */
export async function OnboardingLayer() {
  const supabase = await createClient();
  const { data } = await supabase.from("settings").select("onboarding").maybeSingle();
  if (!data) return null;
  const state = parseOnboarding(data.onboarding);
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
