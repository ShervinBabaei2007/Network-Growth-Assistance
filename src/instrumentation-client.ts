import { reportClientError } from "@/lib/monitoring/client";

// Errors that never reach an error boundary: failures in event handlers and in promises nobody awaited.
window.addEventListener("error", (event) => reportClientError(event.error ?? event.message));
window.addEventListener("unhandledrejection", (event) => reportClientError(event.reason));
