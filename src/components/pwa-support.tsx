"use client";

import { useEffect, useSyncExternalStore } from "react";
import { WifiOff } from "lucide-react";

const subscribe = (notify: () => void) => {
  window.addEventListener("online", notify);
  window.addEventListener("offline", notify);
  return () => {
    window.removeEventListener("online", notify);
    window.removeEventListener("offline", notify);
  };
};

/**
 * Registers the service worker (production only: in development it would cache stale code) and tells the person when
 * they are offline, so a read-only copy of the queue or saved jobs is never mistaken for live data.
 */
export function PwaSupport() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    const register = () => void navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {});
    if (document.readyState === "complete") register();
    else window.addEventListener("load", register, { once: true });
    return () => window.removeEventListener("load", register);
  }, []);

  const online = useSyncExternalStore(subscribe, () => navigator.onLine, () => true);
  if (online) return null;
  return (
    <div role="status" data-testid="offline-banner" className="flex items-center gap-2 border-b bg-warning-soft px-4 py-2 text-sm text-warning">
      <WifiOff aria-hidden className="size-4 shrink-0" />
      <p>You&apos;re offline. What you see may be the last copy saved on this device, and changes won&apos;t save until you&apos;re back online.</p>
    </div>
  );
}
