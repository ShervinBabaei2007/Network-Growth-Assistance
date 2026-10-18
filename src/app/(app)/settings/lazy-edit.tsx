"use client";

import { useState, type ReactNode } from "react";

/**
 * An "Edit" toggle whose form is only built once it is opened. A list of schools or disciplines has one of these
 * per row, and hydrating all those hidden forms up front is what made Settings slow on a phone.
 */
export function LazyEdit({ children, label = "Edit" }: { children: ReactNode; label?: string }) {
  const [opened, setOpened] = useState(false);
  return (
    <details className="mt-1" onToggle={(e) => e.currentTarget.open && setOpened(true)}>
      <summary className="cursor-pointer text-xs text-muted-foreground">{label}</summary>
      <div className="mt-2">{opened ? children : null}</div>
    </details>
  );
}
