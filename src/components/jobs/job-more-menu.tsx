"use client";

import { lazy, Suspense, useState } from "react";
import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";

const load = () => import("@/components/jobs/job-more-menu-impl");
const Menu = lazy(load);

/**
 * The extra things to do with a posting. Until it is used this is only a button: the menu code (about 120 KB with its
 * positioning library) is fetched when the pointer or keyboard reaches the button, and opens straight away on click.
 */
export function JobMoreMenu({ jobId, company }: { jobId: string; company?: string | null }) {
  const [wanted, setWanted] = useState(false);
  const button = (
    <Button size="sm" variant="ghost" aria-haspopup="menu" aria-expanded="false" onPointerEnter={() => void load()} onFocus={() => void load()} onClick={() => setWanted(true)}>
      More <ChevronDown aria-hidden />
    </Button>
  );
  if (!wanted) return button;
  return (
    <Suspense fallback={button}>
      <Menu jobId={jobId} company={company} defaultOpen />
    </Suspense>
  );
}
