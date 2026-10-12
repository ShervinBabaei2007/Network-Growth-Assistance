import Link from "next/link";
import { ArrowUpRight, Building2, ChevronDown, Clock, MapPin } from "lucide-react";
import { FitScore, SourceTag, TIER_STYLE, VerificationBadge, type TierKey } from "@/components/jobs/job-visuals";
import { buttonVariants } from "@/components/ui/button";
import { applyState } from "@/lib/job-postings/apply-state";
import type { FitExplanation } from "@/lib/job-postings/fit";
import { placeLabel, postedLabel } from "@/lib/job-postings/labels";
import { LEVEL_LABELS, WORKPLACE_LABELS, type Workplace } from "@/lib/job-postings/levels";
import type { JobSource } from "@/lib/job-postings/source";
import { cn } from "@/lib/utils";
import { ApplyLink } from "./apply-link";
import { SaveJobButton } from "./save-job-button";

export type CardJob = {
  id: string;
  title: string;
  company: string | null;
  city: string | null;
  province: string | null;
  country: string | null;
  countries: string[];
  remote: boolean;
  workplace_type: string | null;
  posted_at: string;
  date_source: string;
  date_note: string | null;
  source: string;
  user_id: string | null;
  salary: string | null;
  employment_type: string | null;
  experience_level: string | null;
  level_source: string | null;
  apply_url: string | null;
  verification_status: string;
  verification_note: string | null;
  closed_at: string | null;
};

/**
 * One search result. Shows only what the source gave (nothing missing is filled in), how
 * well it fits and why, where it came from, and whether its link is verified. Apply works
 * only for a verified link.
 */
export function JobCard({
  job: j,
  fit,
  explanation,
  skills,
  status,
  source,
  alsoOn,
}: {
  job: CardJob;
  fit: { tier: TierKey; score: number | null; summary: string | null } | null;
  explanation: FitExplanation | null;
  skills: string[];
  status: "saved" | "applied" | "dismissed" | null;
  source: JobSource;
  alsoOn: string[];
}) {
  const tier: TierKey = fit?.tier ?? "unchecked";
  const apply = applyState(j);
  const status_ = j.closed_at ? "expired" : j.verification_status;
  return (
    <li className={cn("grid grid-cols-[4.75rem_minmax(0,1fr)] gap-4 rounded-xl border border-l-4 bg-card p-4 shadow-xs transition-shadow hover:shadow-sm", TIER_STYLE[tier].border)}>
      <FitScore tier={tier} score={fit?.score ?? null} />
      <div className="grid min-w-0 gap-1.5">
        <div className="flex items-start justify-between gap-3">
          <Link href={`/jobs/${j.id}`} className="text-base leading-snug font-semibold hover:text-primary hover:underline">
            {j.title}
          </Link>
          <div className="flex shrink-0 items-center gap-1.5">
            {status === "applied" ? <span className="rounded-full bg-accent px-2 py-0.5 text-xs font-medium text-accent-foreground">Applied</span> : null}
            <VerificationBadge status={status_} />
          </div>
        </div>
        <p className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-sm text-muted-foreground">
          {j.company ? (
            <span className="inline-flex items-center gap-1 font-medium text-foreground">
              <Building2 aria-hidden className="size-3.5 text-muted-foreground" />
              {j.company}
            </span>
          ) : null}
          <span className="inline-flex items-center gap-1">
            <MapPin aria-hidden className="size-3.5" />
            {placeLabel(j)}
          </span>
          {j.workplace_type ? <span>{WORKPLACE_LABELS[j.workplace_type as Workplace]}</span> : null}
          <span className="inline-flex items-center gap-1" title={new Date(j.posted_at).toLocaleString("en-CA")}>
            <Clock aria-hidden className="size-3.5" />
            {postedLabel(j)}
          </span>
          {j.employment_type ? <span>{j.employment_type}</span> : null}
          {j.experience_level ? (
            <span>
              {LEVEL_LABELS[j.experience_level as keyof typeof LEVEL_LABELS]}
              {j.level_source === "title" ? " (from title)" : ""}
            </span>
          ) : null}
          {j.salary ? <span className="text-foreground">{j.salary}</span> : null}
        </p>
        {explanation && (explanation.strong.length || explanation.missing.length) ? (
          <p className="text-sm">
            {explanation.strong.length ? (
              <>
                <span className="text-muted-foreground">Strong matches: </span>
                {explanation.strong.slice(0, 5).join(", ")}
              </>
            ) : null}
            {explanation.missing.length ? (
              <>
                {explanation.strong.length ? " · " : ""}
                <span className="text-muted-foreground">Missing: </span>
                {explanation.missing.slice(0, 3).join(", ")}
              </>
            ) : null}
            {explanation.preferredNotFound.length ? (
              <>
                {" · "}
                <span className="text-muted-foreground">Preferred not found: </span>
                {explanation.preferredNotFound.slice(0, 2).join(", ")}
              </>
            ) : null}
          </p>
        ) : fit?.summary ? (
          <p className="line-clamp-2 text-sm text-muted-foreground">{fit.summary}</p>
        ) : null}
        {skills.length ? <p className="text-xs text-muted-foreground">Skills mentioned: {skills.slice(0, 8).join(", ")}</p> : null}
        {!apply.enabled ? <p className="text-xs text-muted-foreground">{apply.reason}</p> : null}
        <div className="mt-1 flex flex-wrap items-center justify-between gap-2 border-t pt-2">
          <span className="grid gap-0.5">
            <SourceTag source={source} />
            {alsoOn.length ? <span className="text-xs text-muted-foreground">Also listed on {alsoOn.join(", ")}</span> : null}
          </span>
          <div className="flex flex-wrap items-center gap-1">
            <SaveJobButton jobId={j.id} status={status} />
            <details className="relative">
              <summary className={cn(buttonVariants({ size: "sm", variant: "ghost" }), "list-none [&::-webkit-details-marker]:hidden")}>
                More <ChevronDown aria-hidden />
              </summary>
              <ul className="absolute right-0 z-20 mt-1 grid w-60 gap-0.5 rounded-lg border bg-popover p-1 text-sm shadow-lg">
                {[
                  ["View details", `/jobs/${j.id}`],
                  ["Tailor Resume", `/jobs/${j.id}#work`],
                  ["Get Resume Improvement Notes", `/jobs/${j.id}#work`],
                  ["Tailor CV", `/jobs/${j.id}#work`],
                  ["Generate Cover Letter", `/jobs/${j.id}#work`],
                ].map(([label, href]) => (
                  <li key={label}>
                    <Link href={href} className="block rounded-md px-2 py-1.5 hover:bg-muted">
                      {label}
                    </Link>
                  </li>
                ))}
              </ul>
            </details>
            {apply.enabled ? (
              <ApplyLink jobId={j.id} href={apply.href} status={status} className={buttonVariants({ size: "sm" })}>
                Apply <ArrowUpRight aria-hidden />
              </ApplyLink>
            ) : (
              <span role="link" aria-disabled="true" title={apply.reason} className={cn(buttonVariants({ size: "sm" }), "pointer-events-none opacity-50")}>
                {apply.label === "Expired" ? "Expired" : "Apply"}
              </span>
            )}
          </div>
        </div>
      </div>
    </li>
  );
}
