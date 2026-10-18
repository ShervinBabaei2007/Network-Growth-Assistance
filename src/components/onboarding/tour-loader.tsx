"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import type { OnboardingState } from "@/lib/onboarding/steps";

// The tour's code (and its popover library) is only fetched when someone starts it, not on every page.
const ProductTour = dynamic(() => import("@/components/onboarding/tour").then((m) => m.ProductTour));

/** Mounts the tour the first time a page is opened with ?tour=1, and keeps it mounted while it runs. */
export function TourLoader({ initial }: { initial: OnboardingState }) {
  const wanted = useSearchParams().get("tour") === "1";
  const [started, setStarted] = useState(false);
  if (wanted && !started) setStarted(true);
  return started ? <ProductTour initial={initial} /> : null;
}
