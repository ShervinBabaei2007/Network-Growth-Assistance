import { cache } from "react";
import { parseOnboarding, type OnboardingState } from "@/lib/onboarding/state";
import { createClient } from "@/lib/supabase/server";

/**
 * `saved` is false when the stored state couldn't be read (for example a deploy that is ahead of its
 * migration). Callers then fall back to a brand-new state and avoid anything that needs saving.
 */
export type OnboardingRead = { state: OnboardingState; saved: boolean };

/**
 * The signed-in user's onboarding state, or null when they have no settings row yet. Cached for the
 * request, so the layout, the page and the Getting Started card share one read and always agree.
 * RLS limits the read to the user's own row.
 */
export const getOnboarding = cache(async (): Promise<OnboardingRead | null> => {
  const supabase = await createClient();
  const { data, error } = await supabase.from("settings").select("onboarding").maybeSingle();
  if (error) {
    // Logged so a missing migration shows up in the server logs instead of silently hiding onboarding.
    console.error("Couldn't read onboarding state:", error.message);
    return { state: parseOnboarding(undefined), saved: false };
  }
  return data ? { state: parseOnboarding(data.onboarding), saved: true } : null;
});
