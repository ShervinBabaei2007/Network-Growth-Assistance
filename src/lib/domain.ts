import type { Database } from "@/lib/supabase/database.types";

export type Discipline = Database["public"]["Enums"]["discipline"];
export type University = Database["public"]["Enums"]["university"];

export const DISCIPLINE_LABELS: Record<Discipline, string> = {
  ce: "Computer Engineering",
  ee: "Electrical Engineering",
  mech: "Mechatronics Engineering",
  cs: "Computer Science",
};

export const UNIVERSITY_LABELS: Record<University, string> = {
  uoft: "University of Toronto",
  ubc: "University of British Columbia",
  sfu: "Simon Fraser University",
  waterloo: "University of Waterloo",
};

/** Universities with per-discipline targets; the others are additional candidate pools. */
export const PRIMARY_UNIVERSITIES: readonly University[] = ["uoft", "ubc"];

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

export const SHORT_UNIVERSITY: Record<University, string> = {
  uoft: "U of T",
  ubc: "UBC",
  sfu: "SFU",
  waterloo: "Waterloo",
};
