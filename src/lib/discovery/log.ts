/**
 * Structured server logs for discovery. Entries carry ids, counts and provider
 * names only: never names, profile text, queries or imported contact data.
 */
export type DiscoveryEvent =
  | "search_started"
  | "search_step"
  | "search_completed"
  | "search_failed"
  | "provider_failed"
  | "candidate_discovered"
  | "candidate_merged"
  | "candidate_rejected"
  | "matched_known_connection"
  | "llm_output_rejected";

type Fields = Record<string, string | number | boolean | null | undefined>;

export function logDiscovery(event: DiscoveryEvent, fields: Fields = {}) {
  if (process.env.NODE_ENV === "test" || process.env.VITEST) return;
  const line = JSON.stringify({ at: new Date().toISOString(), scope: "discovery", event, ...fields });
  if (event === "provider_failed" || event === "search_failed") console.warn(line);
  else console.info(line);
}
