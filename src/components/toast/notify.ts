"use client";

import { Toast } from "@base-ui/react/toast";
import { TOAST_TIMEOUT_MS, type ToastSpec, type ToastType } from "@/lib/toast";

/** The one toast manager, so any client code can announce something without a hook. */
export const toastManager = Toast.createToastManager();

export type ToastAction = { label: string; onClick: () => void };

/**
 * Shows a toast. A `key` updates the toast already showing with that key instead of
 * stacking a duplicate. Returns the toast's id, for closing or updating it later.
 */
export function notify(spec: ToastSpec, opts: { action?: ToastAction; timeout?: number } = {}): string {
  const id = spec.key ?? `toast-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return toastManager.add({
    id,
    type: spec.type,
    title: spec.title,
    description: spec.description,
    timeout: opts.timeout ?? (opts.action ? Math.max(TOAST_TIMEOUT_MS[spec.type], 8000) : TOAST_TIMEOUT_MS[spec.type]),
    priority: spec.type === "error" || spec.type === "warning" ? "high" : "low",
    actionProps: opts.action
      ? {
          children: opts.action.label,
          onClick: () => {
            opts.action!.onClick();
            toastManager.close(id);
          },
        }
      : undefined,
  });
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
  close: (id?: string) => toastManager.close(id),
};
