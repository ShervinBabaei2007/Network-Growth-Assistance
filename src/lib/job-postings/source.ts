import { ATS_LABELS } from "./ats";
import type { AtsKind } from "./ats/types";

/** Where a posting came from, for people: the employer's own job board, or the site a pasted posting was on. */
export type JobSource = { kind: "board" | "pasted"; label: string; detail: string };

const SITES: [RegExp, string][] = [
  [/(^|\.)linkedin\.com$/i, "LinkedIn"],
  [/(^|\.)indeed\.(com|ca)$/i, "Indeed"],
  [/(^|\.)glassdoor\.(com|ca)$/i, "Glassdoor"],
  [/(^|\.)google\.com$/i, "Google Jobs"],
  [/(^|\.)jobbank\.gc\.ca$/i, "Job Bank"],
  [/(^|\.)ziprecruiter\.(com|ca)$/i, "ZipRecruiter"],
  [/(^|\.)workopolis\.com$/i, "Workopolis"],
];

export function siteName(url: string): string {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    return SITES.find(([re]) => re.test(host))?.[1] ?? host;
  } catch {
    return "a website";
  }
}

export function jobSource(job: { user_id: string | null; apply_url: string }, employer: { name: string; ats: AtsKind } | null | undefined): JobSource {
  if (job.user_id || !employer) return { kind: "pasted", label: siteName(job.apply_url), detail: "Pasted by you" };
  const possessive = /s$/i.test(employer.name) ? `${employer.name}'` : `${employer.name}'s`;
  return { kind: "board", label: ATS_LABELS[employer.ats], detail: `${possessive} job board` };
}
