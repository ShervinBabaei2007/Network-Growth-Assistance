import type { ToastSpec } from "@/lib/toast";

/**
 * The tiny, dependency-free front of the toast system. `notify` writes commands here; the toast interface (which
 * brings its own library) is only downloaded once the first toast is requested, and then drains this queue.
 */

export type ToastAction = { label: string; onClick: () => void };
export type ToastCommand =
  | { kind: "add"; id: string; spec: ToastSpec; opts: { action?: ToastAction; timeout?: number } }
  | { kind: "close"; id?: string };
export type ToastHandler = (command: ToastCommand) => void;

let pending: ToastCommand[] = [];
let handler: ToastHandler | null = null;
let active = false;
const listeners = new Set<() => void>();

/** True once any toast has been requested: the interface should be (or be getting) mounted. */
export const isActive = () => active;

export function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => void listeners.delete(listener);
}

export function dispatch(command: ToastCommand) {
  if (handler) return handler(command);
  // Closing a toast when no interface exists has nothing to close.
  if (command.kind === "close" && !active) return;
  pending.push(command);
  if (!active) {
    active = true;
    listeners.forEach((l) => l());
  }
}

/** Called by the mounted toast interface: it receives everything queued so far, then everything after. */
export function register(next: ToastHandler) {
  handler = next;
  const queued = pending;
  pending = [];
  queued.forEach(next);
  return () => {
    if (handler === next) handler = null;
  };
}
