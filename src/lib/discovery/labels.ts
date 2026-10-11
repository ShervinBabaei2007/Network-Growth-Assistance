import type { Database } from "@/lib/supabase/database.types";

/** Display labels for discovery. Safe to import from client components. */

type Enums = Database["public"]["Enums"];

export const CRM_STATUS_LABELS: Record<Enums["network_person_status"], string> = {
  discovered: "Discovered",
  shortlisted: "Shortlisted",
  ready_to_connect: "Ready to connect",
  connection_sent_manually: "Connection request sent",
  connected: "Connected",
  replied: "Replied",
  follow_up: "Follow up",
  archived: "Archived",
  not_relevant: "Not relevant",
};

export const PROXIMITY_LABELS: Record<Enums["network_proximity"], string> = {
  connected: "Likely already connected",
  not_connected: "Not in your known connections",
  unknown: "Connection unknown",
  manual_second: "2nd degree (marked by you)",
  manual_third: "3rd degree (marked by you)",
};

export const TIER_LABELS: Record<Enums["search_person_tier"], string> = {
  verified: "Verified match",
  possible: "Possible match",
  hidden_connected: "Already connected",
  rejected: "Not a match",
};

export const FEEDBACK_LABELS: Record<Enums["person_feedback_kind"], string> = {
  great_match: "Great match",
  not_relevant: "Not relevant",
  already_connected: "Already connected",
  wrong_person: "Wrong person",
  wrong_program: "Wrong program",
};

export const STAGE_LABELS: Record<string, string> = {
  understanding: "Understanding your request",
  planning: "Planning searches",
  searching: "Searching public sources",
  verifying: "Verifying the top matches on their own pages",
  checking_connections: "Checking your known connections",
  ranking: "Ranking people",
  explaining: "Explaining matches",
  done: "Done",
};

export const FIELD_LABELS: Record<string, string> = {
  institution: "School",
  program: "Program",
  degree: "Degree",
  grad_year: "Graduation year",
  role: "Role",
  company: "Company",
  location: "Location",
  github: "GitHub",
  website: "Website",
  linkedin: "LinkedIn",
};

export const INTERACTION_LABELS: Record<string, string> = {
  status_change: "Status changed",
  note: "Note",
  message_copied: "Copied an intro message",
  linkedin_opened: "Opened LinkedIn profile",
  marked_sent: "Connection request sent (by you, on LinkedIn)",
  replied: "Replied",
  follow_up: "Follow-up",
  proximity: "Connection degree marked",
};

/** Suggested intros stay short enough for a LinkedIn connection note. */
export const INTRO_LIMIT = 300;
