"use client";

import { useRouter } from "next/navigation";
import { saveOnboarding } from "@/app/(app)/actions";
import { Button } from "@/components/ui/button";
import { useActionRunner } from "@/components/toast/use-action-runner";
import { restart, type OnboardingState } from "@/lib/onboarding/steps";

/** Reopens the welcome from the first step and brings back the Getting Started checklist. */
export function RestartGuide({ state }: { state: OnboardingState }) {
  const router = useRouter();
  const { pending, run } = useActionRunner();
  return (
    <Button
      variant="outline"
      disabled={pending}
      onClick={() => run(() => saveOnboarding(restart(state)), { quiet: true, onSuccess: () => router.refresh() })}
    >
      Restart the setup guide
    </Button>
  );
}
