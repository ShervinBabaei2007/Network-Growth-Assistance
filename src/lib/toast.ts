/**
 * What a server action asks the UI to announce. Plain data, so it crosses the server/client
 * boundary. Messages say what happened ("Your tailored resume is ready."), never just
 * "Success!". Toasts are for news; anything the user must come back to stays on the page.
 */
export type ToastType = "success" | "warning" | "error" | "info";

export type ToastSpec = {
  type: ToastType;
  title: string;
  description?: string;
  /** Same key → the existing toast is updated instead of a second one stacking up. */
  key?: string;
};

/** Errors and warnings stay longer so they can be read. */
export const TOAST_TIMEOUT_MS: Record<ToastType, number> = { success: 5000, info: 6000, warning: 9000, error: 12000 };

export const toastSpec = (type: ToastType, title: string, description?: string, key?: string): ToastSpec => ({ type, title, ...(description ? { description } : {}), ...(key ? { key } : {}) });

/** "1 field", "4 fields". */
export const plural = (n: number, word: string, many = `${word}s`) => `${n} ${n === 1 ? word : many}`;
