import { Suspense } from "react";
import { OnboardingWizard } from "@/components/onboarding/wizard";
import { TourLoader } from "@/components/onboarding/tour-loader";
import { getOnboarding } from "@/lib/onboarding/read";
import { shouldShowWizard } from "@/lib/onboarding/state";

/**
 * Mounted once in the app shell. Shows the welcome only to people who haven't finished or skipped
 * it, and the tour only when a page is opened with ?tour=1. RLS limits the read to the user's own row.
 * If the stored state can't be read the tour still works (from the start, without remembering progress),
 * but the welcome is left out because it couldn't remember being finished.
 */
export async function OnboardingLayer() {
  const read = await getOnboarding();
  if (!read) return null;
  const { state, saved } = read;
  // The shell isn't re-rendered on every navigation, so the tour is always mounted and waits for ?tour=1.
  return (
    <>
      {saved && shouldShowWizard(state) ? <OnboardingWizard key={JSON.stringify(state)} initial={state} /> : null}
      <Suspense fallback={null}>
        <TourLoader initial={state} />
      </Suspense>
    </>
  );
}
