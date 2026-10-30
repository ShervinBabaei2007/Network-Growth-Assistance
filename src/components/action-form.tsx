"use client";

import { useActionState, useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { DraftBanner } from "@/components/draft-banner";
import { notify } from "@/components/toast/notify";
import { Button } from "@/components/ui/button";
import { useUnsavedChanges } from "@/hooks/use-unsaved-changes";
import { clearDraft, loadDraft, parseFields, saveDraft, serializeFields } from "@/lib/drafts";
import type { FormState } from "@/lib/form-state";
import { cn } from "@/lib/utils";

/** The form's text fields by name. Passwords, files, buttons and hidden fields are never read, so no secret lands in a draft. */
function readFields(form: HTMLFormElement): Record<string, string> {
  const out: Record<string, string> = {};
  for (const el of Array.from(form.elements)) {
    if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) || !el.name) continue;
    if (el instanceof HTMLInputElement && !["text", "search", "number", "date", "email", "url", "tel"].includes(el.type)) continue;
    out[el.name] = el.value;
  }
  return out;
}

/** Puts draft values back into the matching fields, telling React so controlled wrappers notice. */
function writeFields(form: HTMLFormElement, fields: Record<string, string>) {
  for (const [name, value] of Object.entries(fields)) {
    const el = form.elements.namedItem(name);
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) {
      el.value = value;
      el.dispatchEvent(new Event("input", { bubbles: true }));
    }
  }
}

/**
 * A form bound to a server action, with a pending state. The result is announced as a toast
 * and also kept next to the button, so it can still be read after the toast goes.
 *
 * `protect` warns before leaving with unsaved edits. `draftKey` (with `protect`) also keeps the typed values in this
 * browser and offers them back after a crash or accidental close.
 */
export function ActionForm({
  action,
  submitLabel,
  children,
  className,
  variant,
  size,
  resetOnSuccess,
  protect,
  draftKey,
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  submitLabel: string;
  children?: ReactNode;
  className?: string;
  variant?: "default" | "outline" | "destructive" | "secondary";
  size?: "default" | "sm";
  /** Clear the fields after a successful save (for "add another" forms). */
  resetOnSuccess?: boolean;
  /** Ask before leaving the page while the form has edits that are not saved. */
  protect?: boolean;
  /** Also keep a draft of the text fields under this key (see lib/drafts.ts `draftKey`). */
  draftKey?: string;
}) {
  const [state, formAction, pending] = useActionState(action, { status: "idle" });
  const formRef = useRef<HTMLFormElement>(null);
  const allowReset = useRef(false);
  const [dirty, setDirty] = useState(false);
  const [offered, setOffered] = useState<Record<string, string> | null>(null);
  // The fields as they were when the form first showed, so a draft is only offered if it differs.
  const initial = useRef<string | null>(null);

  useUnsavedChanges(Boolean(protect) && dirty);

  useEffect(() => {
    if (state.status === "idle") return;
    notify(state.toast ?? (state.status === "saved" ? { type: "success", title: state.message ?? "Saved." } : { type: "error", title: state.message ?? "Couldn't save. Try again." }));
  }, [state]);

  // React resets uncontrolled fields after every action, even a failed one. Block
  // that, and clear the form ourselves only after a successful save when asked to.
  useEffect(() => {
    if (resetOnSuccess && state.status === "saved" && formRef.current) {
      allowReset.current = true;
      formRef.current.reset();
      allowReset.current = false;
    }
  }, [state, resetOnSuccess]);

  // A successful save means nothing is waiting to be lost: the warning and the draft both go.
  /* eslint-disable react-hooks/set-state-in-effect -- reacting to the server's answer */
  useEffect(() => {
    if (state.status !== "saved") return;
    setDirty(false);
    if (draftKey) clearDraft(draftKey);
    if (formRef.current) initial.current = serializeFields(readFields(formRef.current));
  }, [state, draftKey]);

  // Offer a stored draft once, after mount (storage only exists in the browser).
  useEffect(() => {
    const form = formRef.current;
    if (!form) return;
    initial.current = serializeFields(readFields(form));
    if (!draftKey) return;
    const stored = loadDraft(draftKey);
    const fields = stored ? parseFields(stored) : null;
    if (fields && serializeFields({ ...readFields(form), ...fields }) !== initial.current) setOffered(fields);
    else if (stored) clearDraft(draftKey);
  }, [draftKey]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const onEdit = () => {
    if (!protect) return;
    const form = formRef.current;
    if (!form) return;
    const now = serializeFields(readFields(form));
    const changed = initial.current !== null && now !== initial.current;
    setDirty(changed);
    if (draftKey && offered === null) {
      if (changed) saveDraft(draftKey, now);
      else clearDraft(draftKey);
    }
  };

  const link = state.href ? (
    <Link href={state.href} className="underline underline-offset-4">
      {state.hrefLabel ?? "Open"}
    </Link>
  ) : null;

  return (
    <form
      ref={formRef}
      action={formAction}
      onInput={onEdit}
      onChange={onEdit}
      onReset={(e) => {
        if (!allowReset.current) e.preventDefault();
      }}
      className={cn("grid gap-3", className)}
    >
      {offered ? (
        <DraftBanner
          onRestore={() => {
            if (formRef.current) writeFields(formRef.current, offered);
            setOffered(null);
          }}
          onDiscard={() => {
            if (draftKey) clearDraft(draftKey);
            setOffered(null);
          }}
        />
      ) : null}
      {children}
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pending} variant={variant} size={size}>
          {pending ? "Saving…" : submitLabel}
        </Button>
        {/* Not a live region: the toast announces it. This copy stays for reading later. */}
        {state.status === "saved" ? (
          <p data-testid="form-status" className="text-sm text-muted-foreground">
            {state.message ?? "Saved."} {link}
          </p>
        ) : null}
        {state.status === "error" ? (
          <p data-testid="form-error" className="text-sm text-destructive">
            {state.message} {link}
          </p>
        ) : null}
      </div>
    </form>
  );
}
