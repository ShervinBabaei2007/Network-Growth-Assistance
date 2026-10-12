import type { JobVerificationStatus } from "./verify-url";

/**
 * Whether the Apply button works for a job, and what to say when it doesn't. Only a
 * verified listing gets a working link: an unchecked link is never presented as safe, and
 * an expired or broken one never as an open opportunity.
 */

export type ApplyState = { enabled: true; href: string; label: string } | { enabled: false; label: string; reason: string };

export function applyState(job: { apply_url: string | null; verification_status: string; verification_note?: string | null; closed_at?: string | null }): ApplyState {
  const status = job.verification_status as JobVerificationStatus;
  if (job.closed_at || status === "expired") return { enabled: false, label: "Expired", reason: "Expired — This job posting is no longer accepting applications." };
  if (!job.apply_url) return { enabled: false, label: "Link unavailable", reason: "Application link unavailable. The source didn't provide a link for this job, and we never guess one." };
  switch (status) {
    case "verified":
      return { enabled: true, href: job.apply_url, label: "Apply" };
    case "pending_validation":
      return { enabled: false, label: "Not yet verified", reason: `Not yet verified: we couldn't confirm this link yet${job.verification_note ? ` (${job.verification_note.replace(/\.$/, "")})` : ""}.` };
    case "unavailable":
      return { enabled: false, label: "Link unavailable", reason: job.verification_note ? `${job.verification_note.replace(/\.$/, "")}.` : "This listing's link isn't working right now." };
    case "failed_validation":
      return { enabled: false, label: "Failed verification", reason: `This link failed our checks${job.verification_note ? `: ${job.verification_note.replace(/\.$/, "").toLowerCase()}` : ""}. It isn't shown as a real posting.` };
    default:
      return { enabled: false, label: "Not yet verified", reason: "Not yet verified: we couldn't confirm this link yet." };
  }
}
