/**
 * Every table that holds a user's own rows, and how the data export treats it. A test
 * compares this with the database types, so a new user-owned table can't ship without
 * a decision here (and in account deletion, which cascades from auth.users).
 */

/** Exported whole: RLS limits each to the caller's own rows. */
export const EXPORTED_TABLES = [
  "settings",
  "universities",
  "disciplines",
  "targets",
  "candidates",
  "invitations",
  "follow_ups",
  "connection_snapshots",
  "daily_queue",
  "job_runs",
  "activity_logs",
  "known_connections",
  "network_searches",
  "network_search_queries",
  "network_sources",
  "network_people",
  "network_person_facts",
  "network_search_people",
  "network_interactions",
  "network_feedback",
  "network_connection_overrides",
  "resumes",
  "resume_lines",
  "job_user_states",
  "job_matches",
  "tailored_documents",
  "improvement_notes",
  "ai_usage",
  "applications",
  "application_events",
  "application_interviews",
  "application_contacts",
  "application_reminders",
  "application_documents",
  "interview_preps",
  "saved_searches",
  "saved_search_matches",
  "notifications",
  "email_deliveries",
  "company_aliases",
  "saved_views",
  "job_notes",
  "job_filters",
] as const;

/** Tables whose rows can be flagged as example data (the demo workspace). Those rows are left out of the export. */
export const SAMPLE_FLAGGED_TABLES: readonly string[] = [
  "universities",
  "disciplines",
  "targets",
  "candidates",
  "invitations",
  "follow_ups",
  "connection_snapshots",
  "applications",
];

/** Exported in part, by the export route itself. */
export const PARTIAL_TABLES = {
  jobs: "only postings the user pasted (shared listings belong to their sources)",
  job_requirements: "only for postings the user pasted",
  user_ai: "only the key's last four characters and when it changed, never the encrypted key",
} as const;

/** Not exported, and why. */
export const EXCLUDED_TABLES = {
  network_search_cache: "temporary search-provider responses, rebuilt on demand",
  employers: "the shared employer directory; the user's additions are only credited to them",
  rate_limits: "internal counters for abuse limits",
} as const;

export const EXPORT_SCHEMA_VERSION = 3;
