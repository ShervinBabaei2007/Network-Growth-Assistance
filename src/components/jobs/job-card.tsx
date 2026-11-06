import Link from "next/link";
import { JobMoreMenu } from "@/components/jobs/job-more-menu";
import { ArrowUpRight, ChevronDown } from "lucide-react";
import { EmployerMark, FitBreakdown, PayRange } from "@/components/jobs/fit-breakdown-view";
import { FitChip, SourceTag, TIER_STYLE, VerificationBadge, type TierKey } from "@/components/jobs/job-visuals";
import { buttonVariants } from "@/components/ui/button";
import { applyState } from "@/lib/job-postings/apply-state";
import type { FitExplanation } from "@/lib/job-postings/fit";
import type { BreakdownRow, PayBar } from "@/lib/job-postings/fit-breakdown";
import { placeLabel, postedLabel } from "@/lib/job-postings/labels";
import { type Workplace } from "@/lib/job-postings/levels";
import { formatters } from "@/lib/i18n";
import { getLocale, getT } from "@/lib/i18n/server";
import type { JobSource } from "@/lib/job-postings/source";
import { cn } from "@/lib/utils";
import { ApplyLink } from "./apply-link";
import { CompareToggle } from "./compare-select";
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
export async function JobCard({
  job: j,
  fit,
  explanation,
  skills,
  status,
  source,
  alsoOn,
  iconUrl,
  breakdown = [],
  pay = null,
}: {
  job: CardJob;
  fit: { tier: TierKey; score: number | null; summary: string | null } | null;
  explanation: FitExplanation | null;
  skills: string[];
  status: "saved" | "applied" | "dismissed" | null;
  source: JobSource;
  alsoOn: string[];
  /** Our own copy of the employer's icon, only when its website is confirmed and the icon was fetched. */
  iconUrl?: string | null;
  /** One bar per area of the posting (skills, experience, eligibility), from the same results as the score. */
  breakdown?: BreakdownRow[];
  /** The stated pay as a range against the person's own minimum; null when the posting states none. */
  pay?: PayBar | null;
}) {
  const [t, locale] = await Promise.all([getT(), getLocale()]);
  const tier: TierKey = fit?.tier ?? "unchecked";
  const apply = applyState(j);
  const status_ = j.closed_at ? "expired" : j.verification_status;
  const strong = explanation?.strong.slice(0, 3) ?? [];
  const missing = explanation?.missing.slice(0, 2) ?? [];
  return (
    <li className={cn("grid gap-2 rounded-xl border border-l-4 bg-card p-4 shadow-xs transition-shadow [contain-intrinsic-size:auto_9rem] [content-visibility:auto] hover:shadow-sm", TIER_STYLE[tier].border)}>
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
        <div className="flex min-w-0 items-start gap-3">
          <EmployerMark name={j.company} iconUrl={iconUrl} />
          <Link href={`/jobs/${j.id}`} className="min-w-0 text-base leading-snug font-semibold hover:text-primary hover:underline">
            {j.title}
          </Link>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {status === "applied" ? <span className="rounded-full bg-accent px-2 py-0.5 text-xs font-medium text-accent-foreground">{t("jobsPage.cardApplied")}</span> : null}
          {/* Verified is the normal case and the page says so once; only call out listings that are not. */}
          {status_ !== "verified" ? <VerificationBadge status={status_} /> : null}
          <FitChip tier={tier} score={fit?.score ?? null} />
        </div>
      </div>
      {/* Plain text, no icons: 25 cards of small SVGs added hundreds of nodes to a page that is mostly this list. */}
      <p className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-sm text-muted-foreground">
        {j.company ? <span className="font-medium text-foreground">{j.company}</span> : null}
        <span>{placeLabel(j, locale)}</span>
        <span title={formatters(locale).date(j.posted_at, { dateStyle: "medium", timeStyle: "short" })}>{postedLabel(j, undefined, locale)}</span>
        {j.salary ? <span className="font-medium text-foreground">{j.salary}</span> : null}
      </p>
      {strong.length || missing.length ? (
        <p className="line-clamp-1 text-sm">
          {strong.length ? (
            <>
              <span className="text-muted-foreground">{t("jobsPage.cardMatches")}</span>
              {strong.join(", ")}
            </>
          ) : null}
          {missing.length ? (
            <>
              {strong.length ? " · " : ""}
              <span className="text-muted-foreground">{t("jobsPage.cardMissing")}</span>
              {missing.join(", ")}
            </>
          ) : null}
        </p>
      ) : fit?.summary ? (
        <p className="line-clamp-1 text-sm text-muted-foreground">{fit.summary}</p>
      ) : null}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <details className="group min-w-0 flex-1 basis-48 text-sm">
          <summary className="inline-flex w-fit cursor-pointer list-none items-center gap-1 rounded-md py-1 text-xs text-muted-foreground hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none [&::-webkit-details-marker]:hidden">
            {t("jobsPage.cardDetails")} <ChevronDown aria-hidden className="size-3.5 transition-transform group-open:rotate-180" />
          </summary>
          <div className="mt-2 grid gap-1.5 text-xs text-muted-foreground">
            <FitBreakdown rows={breakdown} tier={tier} />
            {pay ? <PayRange bar={pay} /> : null}
            <p className="flex flex-wrap gap-x-3 gap-y-0.5">
              {j.workplace_type ? <span>{t(`workplace.${j.workplace_type as Workplace}`)}</span> : null}
              {j.employment_type ? <span>{j.employment_type}</span> : null}
              {j.experience_level ? (
                <span>
                  {t(`level.${j.experience_level as "junior"}`)}
                  {j.level_source === "title" ? t("jobsPage.cardFromTitle") : ""}
                </span>
              ) : null}
            </p>
            {explanation?.preferredNotFound.length ? <p>{t("jobsPage.cardPreferredNotFound", { list: explanation.preferredNotFound.slice(0, 2).join(", ") })}</p> : null}
            {skills.length ? <p>{t("jobsPage.cardSkills", { list: skills.slice(0, 8).join(", ") })}</p> : null}
            {!apply.enabled ? <p>{apply.reason}</p> : null}
            <span className="flex flex-wrap items-center gap-2">
              {status_ === "verified" ? <VerificationBadge status={status_} /> : null}
              <SourceTag source={source} />
            </span>
            {alsoOn.length ? <p>{t("jobsPage.cardAlsoOn", { list: alsoOn.join(", ") })}</p> : null}
          </div>
        </details>
        <div className="flex flex-wrap items-center gap-1">
          <CompareToggle id={j.id} title={j.title} />
          <SaveJobButton jobId={j.id} status={status} />
          <JobMoreMenu jobId={j.id} company={j.company} />
          {apply.enabled ? (
            <ApplyLink jobId={j.id} href={apply.href} status={status} floating className={buttonVariants({ size: "sm" })}>
              {t("jobsPage.cardApply")} <ArrowUpRight aria-hidden />
            </ApplyLink>
          ) : (
            <span role="link" aria-disabled="true" title={apply.reason} className={cn(buttonVariants({ size: "sm" }), "pointer-events-none opacity-50")}>
              {apply.label === "Expired" ? t("jobsPage.cardExpired") : t("jobsPage.cardApply")}
            </span>
          )}
        </div>
      </div>
    </li>
  );
}
