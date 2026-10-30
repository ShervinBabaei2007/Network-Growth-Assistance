"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { Skeleton } from "@/components/ui/skeleton";
import type { Appearance } from "@/lib/appearance";

// The controls (toggle groups and the live preview) are only downloaded once the section is about to be seen.
const AppearanceForm = dynamic(() => import("./appearance-form").then((m) => m.AppearanceForm), { ssr: false, loading: () => <Placeholder /> });

/** Same height as the loaded form, so nothing below it moves when it arrives. */
function Placeholder() {
  return <Skeleton aria-hidden className="h-[34rem] w-full max-w-xl" />;
}

export function LazyAppearanceForm({ initial }: { initial: Appearance }) {
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
      { rootMargin: "600px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [near]);
  return <div ref={ref}>{near ? <AppearanceForm initial={initial} /> : <Placeholder />}</div>;
}
