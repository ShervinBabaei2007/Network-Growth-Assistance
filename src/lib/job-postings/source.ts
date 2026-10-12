import { ATS_LABELS } from "./ats";
import type { AtsKind } from "./ats/types";
import { AGGREGATOR_LABELS, AGGREGATOR_SOURCES, type AggregatorSource } from "./providers/types";

/**
 * Where a posting came from, for people: an employer's own job board, a job site that
 * lists many employers' jobs (Jobicy, Remotive, Adzuna), or the site a pasted posting was on. Every job keeps this, so any result can be
 * traced back to its source.
 */
export type JobSource = { kind: "board" | "aggregator" | "pasted"; label: string; detail: string };

const SITES: [RegExp, string][] = [
  [/(^|\.)linkedin\.com$/i, "LinkedIn"],
  [/(^|\.)indeed\.(com|ca)$/i, "Indeed"],
  [/(^|\.)glassdoor\.(com|ca)$/i, "Glassdoor"],
  [/(^|\.)google\.com$/i, "Google Jobs"],
  [/(^|\.)jobbank\.gc\.ca$/i, "Job Bank"],
  [/(^|\.)ziprecruiter\.(com|ca)$/i, "ZipRecruiter"],
  [/(^|\.)workopolis\.com$/i, "Workopolis"],
  [/(^|\.)adzuna\.(ca|com)$/i, "Adzuna"],
  [/(^|\.)jobicy\.com$/i, "Jobicy"],
  [/(^|\.)remotive\.com$/i, "Remotive"],
  [/(^|\.)arbeitnow\.(com|co\.uk)$/i, "Arbeitnow"],
  [/(^|\.)usajobs\.gov$/i, "USAJOBS"],
];

export function siteName(url: string | null): string {
  if (!url) return "a website";
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    return SITES.find(([re]) => re.test(host))?.[1] ?? host;
  } catch {
    return "a website";
  }
}

const AGGREGATOR_DETAIL: Record<AggregatorSource, string> = {
  jobicy: "a remote-jobs listing on Jobicy, not the employer's own page",
  remotive: "a remote-jobs listing on Remotive, not the employer's own page",
  arbeitnow: "a listing on Arbeitnow, not the employer's own page",
  usajobs: "the official U.S. federal job announcement",
  adzuna: "job search results",
};

export const isAggregator = (source: string | null | undefined): source is AggregatorSource => (AGGREGATOR_SOURCES as readonly string[]).includes(source ?? "");

/** "Also listed on …" for a merged copy of a job. */
export function alsoListedOn(source: string): string {
  if (isAggregator(source)) return AGGREGATOR_LABELS[source];
  return source === "manual" ? "your pasted postings" : "an employer board";
}

export function jobSource(job: { user_id: string | null; apply_url: string | null; source?: string | null }, employer: { name: string; ats: AtsKind } | null | undefined): JobSource {
  if (isAggregator(job.source)) return { kind: "aggregator", label: AGGREGATOR_LABELS[job.source], detail: AGGREGATOR_DETAIL[job.source] };
  if (job.user_id || !employer) return { kind: "pasted", label: siteName(job.apply_url), detail: "Pasted by you" };
  const possessive = /s$/i.test(employer.name) ? `${employer.name}'` : `${employer.name}'s`;
  return { kind: "board", label: ATS_LABELS[employer.ats], detail: `${possessive} job board` };
}
