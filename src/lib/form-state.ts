import { z } from "zod";
import type { ToastSpec } from "./toast";

export type FormState = {
  status: "idle" | "saved" | "error";
  message?: string;
  /** What to announce, when it differs from the message (e.g. a warning after a save). */
  toast?: ToastSpec;
  /** Optional link shown with the message, e.g. to an existing duplicate record. */
  href?: string;
  hrefLabel?: string;
};

export const saved = (message?: string, link?: { href: string; label: string }): FormState => ({
  status: "saved",
  message,
  href: link?.href,
  hrefLabel: link?.label,
});
export const failed = (message: string, link?: { href: string; label: string }): FormState => ({
  status: "error",
  message,
  href: link?.href,
  hrefLabel: link?.label,
});

/** First validation message from a Zod error, for showing next to a form. */
export const firstIssue = (error: z.ZodError) => error.issues[0]?.message ?? "Check the values and try again.";

const blankToNull = (v: unknown) => (v === "" || v === null || v === undefined ? null : v);

/** A whole number from a form field; blank becomes null when optional. */
export const formInt = (label: string, { min = 0, max = 1_000_000 } = {}) =>
  z.coerce
    .number({ error: `${label} must be a number.` })
    .int(`${label} must be a whole number.`)
    .min(min, `${label} must be at least ${min}.`)
    .max(max, `${label} must be at most ${max.toLocaleString("en-CA")}.`);

export const optionalFormInt = (label: string, opts?: { min?: number; max?: number }) =>
  z.preprocess(blankToNull, formInt(label, opts).nullable());

export const formDate = (label: string) =>
  z.string().regex(/^\d{4}-\d{2}-\d{2}$/, `${label} must be a date.`);
