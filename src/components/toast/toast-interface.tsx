"use client";

import { Toast } from "@base-ui/react/toast";
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from "lucide-react";
import { cn } from "cn";
import { useEffect } from "react";
import { TOAST_TIMEOUT_MS, type ToastType } from "@/lib/toast";
import { register, type ToastCommand } from "./store";

const ICONS: Record<ToastType, typeof Info> = { success: CheckCircle2, warning: AlertTriangle, error: XCircle, info: Info };
const TONE: Record<ToastType, string> = {
  success: "border-l-success [&_[data-icon]]:text-success",
  warning: "border-l-warning [&_[data-icon]]:text-warning",
  error: "border-l-destructive [&_[data-icon]]:text-destructive",
  info: "border-l-primary [&_[data-icon]]:text-primary",
};

const toastManager = Toast.createToastManager();

/** Turns a request from `notify` into a toast (or closes one). */
function apply(command: ToastCommand) {
  if (command.kind === "close") return void toastManager.close(command.id);
  const { id, spec, opts } = command;
  toastManager.add({
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

/**
 * The toast interface, loaded by Toaster when the first toast is requested. Toasts are announced to screen readers
 * (errors and warnings urgently), can be dismissed with the close button, Escape or a swipe, pause while hovered or
 * focused, and F6 moves focus to them.
 */
export default function ToastInterface() {
  // This effect runs after the provider's own (children first), so the provider is listening before anything is added.
  useEffect(() => register(apply), []);
  return (
    <Toast.Provider toastManager={toastManager} limit={3}>
      <Toast.Portal>
        <Toast.Viewport
          aria-label="Notifications"
          className="fixed inset-x-4 bottom-[max(1rem,env(safe-area-inset-bottom))] z-[60] mx-auto flex max-w-md flex-col gap-2 outline-none sm:right-4 sm:left-auto sm:mx-0 sm:w-96"
        >
          <ToastList />
        </Toast.Viewport>
      </Toast.Portal>
    </Toast.Provider>
  );
}

function ToastList() {
  const { toasts } = Toast.useToastManager();
  return toasts.map((t) => {
    const type = (t.type as ToastType | undefined) ?? "info";
    const Icon = ICONS[type];
    return (
      <Toast.Root
        key={t.id}
        toast={t}
        swipeDirection={["right", "down"]}
        data-testid="toast"
        className={cn(
          "relative rounded-lg border border-l-4 bg-popover p-3 pr-9 text-popover-foreground shadow-lg transition-all duration-200 data-[ending-style]:opacity-0 data-[limited]:hidden data-[starting-style]:translate-y-2 data-[starting-style]:opacity-0",
          TONE[type],
        )}
      >
        <Toast.Content className="flex items-start gap-2.5">
          <Icon data-icon aria-hidden className="mt-0.5 size-4 shrink-0" />
          <div className="min-w-0 flex-1 space-y-0.5">
            <Toast.Title className="text-sm leading-snug font-medium" />
            <Toast.Description className="text-sm leading-snug text-muted-foreground" />
            {t.actionProps ? (
              <Toast.Action className="mt-1.5 inline-flex h-7 items-center rounded-md border border-border px-2.5 text-xs font-medium hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none" />
            ) : null}
          </div>
        </Toast.Content>
        {/* Base UI hides this button from assistive tech while collapsed but leaves it tabbable; keep it exposed. */}
        <Toast.Close aria-label="Dismiss notification" aria-hidden={false} className="absolute top-2.5 right-2.5 rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none">
          <X className="size-3.5" aria-hidden />
        </Toast.Close>
      </Toast.Root>
    );
  });
}
