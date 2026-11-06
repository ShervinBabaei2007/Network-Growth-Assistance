import { FormError } from "@/components/form-error";
import type { MessageKey } from "@/lib/i18n";
import { getT } from "@/lib/i18n/server";

/** The English noun phrases callers pass, and where their translations live. An unknown phrase is shown as given. */
const WHAT: Record<string, MessageKey> = {
  analytics: "loadWhat.analytics",
  "this application": "loadWhat.thisApplication",
  "your applications": "loadWhat.yourApplications",
  candidates: "loadWhat.candidates",
  connections: "loadWhat.connections",
  "discipline progress": "loadWhat.disciplineProgress",
  "your searches": "loadWhat.yourSearches",
  "your follow-ups": "loadWhat.yourFollowUps",
  "these jobs": "loadWhat.theseJobs",
  employers: "loadWhat.employers",
  "your hidden jobs": "loadWhat.yourHiddenJobs",
  postings: "loadWhat.postings",
  "this resume": "loadWhat.thisResume",
  "your resumes": "loadWhat.yourResumes",
  "your saved searches": "loadWhat.yourSavedSearches",
  "your notifications": "loadWhat.yourNotifications",
  "your progress": "loadWhat.yourProgress",
  people: "loadWhat.people",
  "today's queue": "loadWhat.todaysQueue",
  "your settings": "loadWhat.yourSettings",
  "school progress": "loadWhat.schoolProgress",
};

export async function LoadError({ what }: { what: string }) {
  const t = await getT();
  const key = WHAT[what];
  return <FormError>{t("loadError", { what: key ? t(key) : what })}</FormError>;
}
