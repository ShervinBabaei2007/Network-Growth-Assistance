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
