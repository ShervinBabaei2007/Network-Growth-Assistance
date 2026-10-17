import { cache } from "react";
import { parseOnboarding, type OnboardingState } from "@/lib/onboarding/state";
import { createClient } from "@/lib/supabase/server";

/**
 * The signed-in user's onboarding state, or null when they have no settings row yet. Cached for the
 * request, so the layout, the page and the Getting Started card share one read and always agree.
 * RLS limits the read to the user's own row.
 */
export const getOnboarding = cache(async (): Promise<OnboardingState | null> => {
  const supabase = await createClient();
  const { data } = await supabase.from("settings").select("onboarding").maybeSingle();
  return data ? parseOnboarding(data.onboarding) : null;
});
