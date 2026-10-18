import { z } from "zod";
import { GOALS, STATUSES, WIZARD_STEPS, type OnboardingState } from "./steps";

/**
 * Validation for the stored onboarding state. Server only: the browser imports ./steps instead, so Zod
 * isn't downloaded with every page. The parsed value is checked against the hand-written OnboardingState type.
 */

const stateSchema = z.object({
  status: z.enum(STATUSES).catch("new"),
  step: z.number().int().min(0).max(WIZARD_STEPS - 1).catch(0),
  goal: z.enum(GOALS).optional().catch(undefined),
  tourDone: z.boolean().catch(false),
  tourStep: z.number().int().min(0).max(20).catch(0),
  checklistDismissed: z.boolean().catch(false),
});

/** What the browser may send back to be saved. Anything else is dropped. */
export const onboardingInputSchema = z.object({
  status: z.enum(STATUSES),
  step: z.number().int().min(0).max(WIZARD_STEPS - 1),
  goal: z.enum(GOALS).optional(),
  tourDone: z.boolean(),
  tourStep: z.number().int().min(0).max(20),
  checklistDismissed: z.boolean(),
});

/** A partial update from the browser. The server merges it into what is stored, so a stale page can't undo newer progress. */
export const onboardingPatchSchema = onboardingInputSchema.partial();

/** Reads the stored jsonb. Anything missing or malformed falls back to a brand-new user. */
export function parseOnboarding(raw: unknown): OnboardingState {
  const value = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  return stateSchema.parse(value);
}
