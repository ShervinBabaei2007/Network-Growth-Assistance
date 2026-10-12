"use client";

import { useEffect } from "react";
import { notify } from "./notify";

/**
 * Announces a form action's outcome (from useActionState) as a toast when it finishes.
 * The page keeps showing the details; the toast is the heads-up.
 */
export function useStateToast(state: { status: string; message?: string }, done: string[] = ["imported", "saved"]) {
  useEffect(() => {
    if (state.status === "error") notify({ type: "error", title: state.message ?? "Something went wrong. Nothing was changed." });
    else if (done.includes(state.status) && state.message) notify({ type: "success", title: state.message });
    // Only a new result should announce; `done` is a constant list.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);
}
