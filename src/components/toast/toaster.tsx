"use client";

import { lazy, Suspense, useSyncExternalStore } from "react";
import { isActive, subscribe } from "./store";

// The toast interface and its library are a separate chunk: most page views never show a toast.
const ToastInterface = lazy(() => import("./toast-interface"));

/**
 * The app's one place for toasts, mounted once in the root layout. It renders nothing extra until the first
 * toast is requested, then loads and mounts the interface (see toast-interface.tsx).
 */
export function Toaster({ children }: { children: React.ReactNode }) {
  const active = useSyncExternalStore(subscribe, isActive, () => false);
  return (
    <>
      {children}
      {active ? (
        <Suspense fallback={null}>
          <ToastInterface />
        </Suspense>
      ) : null}
    </>
  );
}
