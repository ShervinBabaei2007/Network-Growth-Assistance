import type { ToastSpec } from "./toast";

/**
 * What a button's server action returns. `message` is the short text for inline status;
 * `toast` (optional) is what to announce, when it differs from a plain success/error.
 */
export type ActionResult<T = undefined> =
  | { ok: true; message?: string; toast?: ToastSpec; data?: T }
  | { ok: false; error: string; toast?: ToastSpec; data?: T };

export const ok = <T = undefined>(message?: string, extra: { toast?: ToastSpec; data?: T } = {}): ActionResult<T> => ({ ok: true, message, ...extra });
export const err = <T = undefined>(error: string, extra: { toast?: ToastSpec; data?: T } = {}): ActionResult<T> => ({ ok: false, error, ...extra });
