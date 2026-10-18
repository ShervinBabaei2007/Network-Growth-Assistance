"use client";

import { lazy, Suspense, useSyncExternalStore, type ComponentProps } from "react";
import { NativeSelect } from "@/components/ui/native-select";
import { splitClasses } from "@/lib/ui/select-options";
import { cn } from "@/lib/utils";

/** A mouse and a hover-capable screen: a desktop. Phones and tablets keep their own picker. */
const FINE_POINTER = "(hover: hover) and (pointer: fine)";

function subscribe(onChange: () => void) {
  const query = window.matchMedia(FINE_POINTER);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

const useFinePointer = () =>
  useSyncExternalStore(
    subscribe,
    () => window.matchMedia(FINE_POINTER).matches,
    // Server and first paint: the native control, which works before any JavaScript has run.
    () => false,
  );

// The styled desktop select is its own chunk, so phones never download it.
const DesktopSelect = lazy(() => import("@/components/app-select-desktop").then((m) => ({ default: m.DesktopSelect })));

export type AppSelectProps = Omit<ComponentProps<"select">, "size">;

/**
 * The app's dropdown, written like a plain `<select>` with `<option>` children. On a desktop it is the shadcn Select
 * popover; on phones and tablets it is the shadcn Native Select, so the device's own picker opens. Both submit with plain
 * forms, and the native one is what shows (and works) until the desktop one has loaded.
 */
export function AppSelect({ className, ...props }: AppSelectProps) {
  const desktop = useFinePointer();
  // Call sites pass classes for the control (height, text size) and for its place in a layout (width, margins).
  // The shadcn native select has a wrapper for the second kind and the element itself for the first.
  const [layout, control] = splitClasses(className);
  const native = <NativeSelect className={cn("w-full", layout)} selectClassName={control} {...props} />;
  if (!desktop) return native;
  return (
    <Suspense fallback={native}>
      <DesktopSelect className={className} {...props} />
    </Suspense>
  );
}
