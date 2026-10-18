import { getSettings } from "@/lib/data/settings";
import { parseOnboarding, type OnboardingState } from "@/lib/onboarding/state";

/**
 * `saved` is false when the stored state couldn't be read (for example a deploy that is ahead of its
 * migration). Callers then fall back to a brand-new state and avoid anything that needs saving.
 */
export type OnboardingRead = { state: OnboardingState; saved: boolean };

/**
 * The signed-in user's onboarding state, or null when they have no settings row yet. It comes from the
 * request's shared settings read, so the layout, the page and the Getting Started card always agree.
 */
export async function getOnboarding(): Promise<OnboardingRead | null> {
  const { row, error } = await getSettings();
  if (error) {
    // Logged so a missing migration shows up in the server logs instead of silently hiding onboarding.
    console.error("Couldn't read onboarding state:", error);
    return { state: parseOnboarding(undefined), saved: false };
  }
  return row ? { state: parseOnboarding(row.onboarding), saved: true } : null;
}
