"use client";

import { useReportWebVitals } from "next/web-vitals";
import { reportVital } from "@/lib/monitoring/client";

const SEND = new Set(["LCP", "INP", "CLS", "FCP", "TTFB"]);

// A stable function, so the same measurement isn't reported twice.
function onMetric(metric: { name: string; value: number; rating?: string }) {
  if (SEND.has(metric.name)) reportVital(metric);
}

/** Reports how the page performed for this visitor. Renders nothing. */
export function WebVitals() {
  useReportWebVitals(onMetric);
  return null;
}
