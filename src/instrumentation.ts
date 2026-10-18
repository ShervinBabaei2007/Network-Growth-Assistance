import type { Instrumentation } from "next";

/**
 * Server errors (a page, route handler or server action that throws) are recorded with the same scrubbing as
 * browser errors, next to the structured logs. Only the route pattern, a scrubbed message and the framework's digest are kept.
 */
export const onRequestError: Instrumentation.onRequestError = async (err, request, context) => {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  try {
    const { normalizeRoute } = await import("@/lib/monitoring/route");
    const { scrubError } = await import("@/lib/monitoring/scrub");
    const { createAdminClient } = await import("@/lib/supabase/admin");
    const { log } = await import("@/lib/server/log");
    const route = normalizeRoute(request.path);
    const error = err instanceof Error ? err : new Error(String(err));
    const digest = typeof err === "object" && err !== null && "digest" in err ? String((err as { digest: unknown }).digest) : undefined;
    const clean = scrubError({ message: error.message, stack: error.stack, source: "server", route });
    log("error", "request", "unhandled", { route, kind: context.routeType, digest, message: clean.message });
    await createAdminClient().rpc("record_client_error", {
      p_fingerprint: clean.fingerprint,
      p_source: "server",
      p_route: route,
      p_message: clean.message,
      p_stack: clean.stack ?? "",
      p_digest: digest?.replace(/[^\w-]/g, "").slice(0, 100) ?? "",
    });
  } catch {
    // Reporting an error must never cause another.
  }
};
