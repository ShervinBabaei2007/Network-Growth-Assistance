"use client";

import { useEffect, useRef, useState, type ComponentProps } from "react";
import dynamic from "next/dynamic";

type Charts = typeof import("@/components/charts");

// The charts library is large, so it is only downloaded once a chart is about to be seen.
const DailyBarsChart = dynamic(() => import("@/components/charts").then((m) => m.DailyBars), { loading: () => <div className="h-48 w-full" /> });
const NetworkLineChart = dynamic(() => import("@/components/charts").then((m) => m.NetworkLine), { loading: () => <div className="h-56 w-full" /> });

/** True once the element is within a screen's height of the viewport; stays true afterwards. */
function useNearViewport() {
  const ref = useRef<HTMLDivElement>(null);
  const [near, setNear] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || near) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setNear(true);
          observer.disconnect();
        }
      },
      { rootMargin: "400px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [near]);
  return [ref, near] as const;
}

/** Same box as the real chart (and the same text label) until it loads, so nothing on the page moves. */
export function LazyDailyBars(props: ComponentProps<Charts["DailyBars"]>) {
  const [ref, near] = useNearViewport();
  return near ? <DailyBarsChart {...props} /> : <div ref={ref} role="img" aria-label={props.label} className="h-48 w-full" />;
}

export function LazyNetworkLine(props: ComponentProps<Charts["NetworkLine"]>) {
  const [ref, near] = useNearViewport();
  return near ? <NetworkLineChart {...props} /> : <div ref={ref} role="img" aria-label={props.label} className="h-56 w-full" />;
}
