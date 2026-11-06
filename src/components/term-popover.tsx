"use client";

import dynamic from "next/dynamic";
import { useState } from "react";

export const TERM_BUTTON =
  "cursor-help rounded-sm underline decoration-dotted underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

const Impl = dynamic(() => import("./term-popover-impl"), { ssr: false });

/**
 * The interactive half of Term. Until it is first pressed it is a plain button; then the popover loads and opens
 * in its place, so the library costs nothing on pages where nobody asks. Strings arrive already translated.
 */
export function TermPopover(props: { label: string; definition: string; ariaLabel: string; children?: React.ReactNode }) {
  const [asked, setAsked] = useState(false);
  if (asked) return <Impl {...props} />;
  return (
    <button type="button" className={TERM_BUTTON} aria-label={props.ariaLabel} onClick={() => setAsked(true)}>
      {props.children ?? props.label}
    </button>
  );
}
