/**
 * Rules about a saved person's CRM status that the single-person actions and the bulk actions must agree on.
 * They live here once; before, each side carried its own copy.
 */

export const PERSON_STATUSES = ["discovered", "shortlisted", "ready_to_connect", "connection_sent_manually", "connected", "replied", "follow_up", "archived", "not_relevant"] as const;
export type PersonStatus = (typeof PERSON_STATUSES)[number];

/**
 * "Connected" in the CRM is the user's own statement, so the person counts as a known connection too. These are the
 * columns that follow from it.
 */
export const CONNECTED_PATCH = { proximity: "connected", known_match_state: "confirmed_same" } as const;

/** The history entry a status change leaves behind. */
export const statusInteractionKind = (status: PersonStatus): "marked_sent" | "replied" | "status_change" =>
  status === "connection_sent_manually" ? "marked_sent" : status === "replied" ? "replied" : "status_change";

/** Marking someone not relevant does not save them to People; any other status does. */
export const savesPerson = (status: PersonStatus): true | undefined => (status !== "not_relevant" ? true : undefined);
