"use client";

import { useActionState, useEffect, useRef, type ReactNode } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import type { FormState } from "@/lib/form-state";
import { cn } from "@/lib/utils";

/** A form bound to a server action, with a pending state and an inline result message. */
export function ActionForm({
  action,
  submitLabel,
  children,
  className,
  variant,
  size,
  resetOnSuccess,
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  submitLabel: string;
  children?: ReactNode;
  className?: string;
  variant?: "default" | "outline" | "destructive" | "secondary";
  size?: "default" | "sm";
  /** Clear the fields after a successful save (for "add another" forms). */
  resetOnSuccess?: boolean;
}) {
  const [state, formAction, pending] = useActionState(action, { status: "idle" });
  const formRef = useRef<HTMLFormElement>(null);
  const allowReset = useRef(false);

  // React resets uncontrolled fields after every action, even a failed one. Block
  // that, and clear the form ourselves only after a successful save when asked to.
  useEffect(() => {
    if (resetOnSuccess && state.status === "saved" && formRef.current) {
      allowReset.current = true;
      formRef.current.reset();
      allowReset.current = false;
    }
  }, [state, resetOnSuccess]);

  const link = state.href ? (
    <Link href={state.href} className="underline underline-offset-4">
      {state.hrefLabel ?? "Open"}
    </Link>
  ) : null;

  return (
    <form
      ref={formRef}
      action={formAction}
      onReset={(e) => {
        if (!allowReset.current) e.preventDefault();
      }}
      className={cn("grid gap-3", className)}
    >
      {children}
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pending} variant={variant} size={size}>
          {pending ? "Saving…" : submitLabel}
        </Button>
        {state.status === "saved" ? (
          <p role="status" className="text-sm text-muted-foreground">
            {state.message ?? "Saved."} {link}
          </p>
        ) : null}
        {state.status === "error" ? (
          <p role="alert" className="text-sm text-destructive">
            {state.message} {link}
          </p>
        ) : null}
      </div>
    </form>
  );
}
