"use client";

/**
 * Sends measurements and errors to our own server (never to a third party). Nothing is sent if the visitor's
 * browser says Do Not Track, and nothing about the person goes with it: the server keeps only the route pattern.
 */

function allowed(): boolean {
  return typeof navigator !== "undefined" && navigator.doNotTrack !== "1";
}

function send(url: string, payload: unknown) {
  if (!allowed()) return;
  try {
    const data = JSON.stringify(payload);
    if (!navigator.sendBeacon?.(url, new Blob([data], { type: "text/plain" }))) {
      void fetch(url, { method: "POST", body: data, keepalive: true, headers: { "Content-Type": "text/plain" } }).catch(() => {});
    }
  } catch {
    // Monitoring never gets in the way of the page.
  }
}

export function reportVital(metric: { name: string; value: number; rating?: string }) {
  send("/api/vitals", { name: metric.name, value: metric.value, rating: metric.rating, path: location.pathname });
}

let sent = 0;
/** At most a few reports per page load, so one broken loop can't flood the server. */
export function reportClientError(error: unknown, digest?: string) {
  if (sent >= 5) return;
  sent++;
  const e = error instanceof Error ? error : new Error(typeof error === "string" ? error : "Unknown error");
  send("/api/client-errors", { message: e.message, stack: e.stack, digest, path: location.pathname });
}
