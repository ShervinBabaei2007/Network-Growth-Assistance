import type { Database } from "@/lib/supabase/database.types";

/** A user's discipline (field of study or work), by id. The user defines their own. */
export type Discipline = string;
/** A user's school (university, college or other institution), by id. The user defines their own. */
export type University = string;

/** One of the user's schools: its name, the other ways it's written, and whether it has its own targets. */
export type School = { id: University; name: string; aliases: string[]; hasTargets: boolean; position: number };
/** One of the user's disciplines, in their priority order (position). */
export type Field = { id: Discipline; name: string; aliases: string[]; position: number };

/** The user's own schools and disciplines, ordered. Nothing here is built in. */
export type Catalog = { universities: School[]; disciplines: Field[] };

export const EMPTY_CATALOG: Catalog = { universities: [], disciplines: [] };

export const universityName = (c: Catalog, id: University | null | undefined) => (id ? (c.universities.find((u) => u.id === id)?.name ?? "Removed school") : "");
export const disciplineName = (c: Catalog, id: Discipline | null | undefined) => (id ? (c.disciplines.find((d) => d.id === id)?.name ?? "Removed discipline") : "");

/** Schools with their own per-discipline targets; the others are extra candidate pools. */
export const targetUniversities = (c: Catalog) => c.universities.filter((u) => u.hasTargets);
export const poolUniversities = (c: Catalog) => c.universities.filter((u) => !u.hasTargets);

/** Rows from the database, sorted by position, as a Catalog. */
export function toCatalog(
  universities: { id: string; name: string; aliases: string[]; has_targets: boolean; position: number }[],
  disciplines: { id: string; name: string; aliases: string[]; position: number }[],
): Catalog {
  const byPos = <T extends { position: number; name: string }>(a: T, b: T) => a.position - b.position || a.name.localeCompare(b.name);
  return {
    universities: universities.map((u) => ({ id: u.id, name: u.name, aliases: u.aliases, hasTargets: u.has_targets, position: u.position })).sort(byPos),
    disciplines: disciplines.map((d) => ({ id: d.id, name: d.name, aliases: d.aliases, position: d.position })).sort(byPos),
  };
}

export type CandidateStatus = Database["public"]["Enums"]["candidate_status"];
export type DegreeLevel = Database["public"]["Enums"]["degree_level"];

export const STATUS_LABELS: Record<CandidateStatus, string> = {
  new: "New",
  awaiting_review: "Awaiting review",
  approved: "Approved for outreach",
  invitation_sent: "Invitation sent",
  invitation_pending: "Invitation pending",
  connected: "Connected",
  declined_withdrawn: "Declined or withdrawn",
  not_a_match: "Not a match",
  do_not_contact: "Do not contact",
};

export const DEGREE_LABELS: Record<DegreeLevel, string> = {
  undergraduate: "Undergraduate",
  masters: "Master's",
  doctoral: "Doctoral",
  alumni: "Alumni",
  other: "Other",
};
