"use client";

import { useActionState, type ReactNode } from "react";
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
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  submitLabel: string;
  children?: ReactNode;
  className?: string;
  variant?: "default" | "outline" | "destructive" | "secondary";
}) {
  const [state, formAction, pending] = useActionState(action, { status: "idle" });

  return (
    <form action={formAction} className={cn("grid gap-3", className)}>
      {children}
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pending} variant={variant}>
          {pending ? "Saving…" : submitLabel}
        </Button>
        {state.status === "saved" ? (
          <p role="status" className="text-sm text-muted-foreground">
            {state.message ?? "Saved."}
          </p>
        ) : null}
        {state.status === "error" ? (
          <p role="alert" className="text-sm text-destructive">
            {state.message}
          </p>
        ) : null}
      </div>
    </form>
  );
}
