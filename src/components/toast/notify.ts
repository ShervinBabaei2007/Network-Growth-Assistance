"use client";

import { type ToastSpec, type ToastType } from "@/lib/toast";
import { dispatch, type ToastAction } from "./store";

export type { ToastAction } from "./store";

/**
 * Shows a toast. A `key` updates the toast already showing with that key instead of
 * stacking a duplicate. Returns the toast's id, for closing it later. The toast interface
 * is loaded on first use, so pages that never show a toast never download it.
 */
export function notify(spec: ToastSpec, opts: { action?: ToastAction; timeout?: number } = {}): string {
  const id = spec.key ?? `toast-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  dispatch({ kind: "add", id, spec, opts });
  return id;
}

const shortcut = (type: ToastType) => (title: string, description?: string, opts?: { key?: string; action?: ToastAction; timeout?: number }) =>
  notify({ type, title, description, key: opts?.key }, opts);

export const toast = {
  success: shortcut("success"),
  warning: shortcut("warning"),
  error: shortcut("error"),
  info: shortcut("info"),
  /** A "working on it" toast that stays until replaced by the result with the same key. */
  progress: (title: string, key: string) => notify({ type: "info", title, key }, { timeout: 0 }),
  close: (id?: string) => dispatch({ kind: "close", id }),
};
