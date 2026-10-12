"use client";

import { useState, useTransition } from "react";
import type { ActionResult } from "@/lib/action-result";
import { notify, toast } from "./notify";

type RunOptions = {
  /** Shown while the action runs, then replaced by its result. */
  progress?: string;
  /** Offered on success as an "Undo" button; runs this action and announces its result. */
  undo?: () => Promise<ActionResult<unknown>>;
  /** Called with a successful result (e.g. to update local state). */
  onSuccess?: (result: ActionResult<unknown>) => void;
  /** Don't announce a plain success (the page itself shows the change). */
  quiet?: boolean;
};

let counter = 0;

/**
 * Runs a server action from a button and announces the outcome through the app's toasts.
 * Also returns the last result's text for an inline status line where the page needs one.
 */
export function useActionRunner() {
  const [pending, start] = useTransition();
  const [last, setLast] = useState<{ ok: boolean; text: string } | null>(null);

  const run = <T,>(fn: () => Promise<ActionResult<T>>, opts: RunOptions = {}) =>
    start(async () => {
      const key = `action-${++counter}`;
      if (opts.progress) toast.progress(opts.progress, key);
      let r: ActionResult<T>;
      try {
        r = await fn();
      } catch {
        r = { ok: false, error: "Something went wrong. Nothing was changed; try again." };
      }
      setLast(r.ok ? (r.message ? { ok: true, text: r.message } : null) : { ok: false, text: r.error });
      const spec = r.toast ?? (r.ok ? (r.message ? { type: "success" as const, title: r.message } : null) : { type: "error" as const, title: r.error });
      if (spec && !(r.ok && opts.quiet && !r.toast)) {
        notify(
          { ...spec, key: spec.key ?? key },
          r.ok && opts.undo
            ? {
                action: {
                  label: "Undo",
                  onClick: () =>
                    start(async () => {
                      const u = await opts.undo!();
                      notify(u.toast ?? (u.ok ? { type: "info", title: u.message ?? "Undone." } : { type: "error", title: u.error }));
                    }),
                },
              }
            : {},
        );
      } else if (opts.progress) {
        toast.close(key);
      }
      if (r.ok) opts.onSuccess?.(r as ActionResult<unknown>);
    });

  return { pending, run, last };
}
