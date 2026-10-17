import { ClipboardPaste, Globe } from "lucide-react";
import type { JobSource } from "@/lib/job-postings/source";
import { cn } from "@/lib/utils";

export type TierKey = "strong" | "good" | "stretch" | "excluded" | "unchecked";

/** One colour per fit tier, used everywhere a tier is shown. Text and background pairs meet 4.5:1. */
export const TIER_STYLE: Record<TierKey, { soft: string; text: string; border: string; dot: string; label: string }> = {
  strong: { soft: "bg-success-soft", text: "text-success", border: "border-l-success", dot: "bg-success", label: "Strong match" },
  good: { soft: "bg-info-soft", text: "text-info", border: "border-l-info", dot: "bg-info", label: "Good match" },
  stretch: { soft: "bg-warning-soft", text: "text-warning", border: "border-l-warning", dot: "bg-warning", label: "Stretch" },
  excluded: { soft: "bg-danger-soft", text: "text-destructive", border: "border-l-destructive", dot: "bg-destructive", label: "Doesn't qualify" },
  unchecked: { soft: "bg-muted", text: "text-muted-foreground", border: "border-l-border", dot: "bg-muted-foreground/50", label: "Not checked" },
};

/** The fit at a glance: the score large, the tier underneath, in the tier's colour. */
export function FitScore({ tier, score, size = "md" }: { tier: TierKey; score: number | null; size?: "md" | "lg" }) {
  const s = TIER_STYLE[tier];
  const showScore = score !== null && tier !== "excluded" && tier !== "unchecked";
  return (
    <div
      className={cn("flex flex-col items-center justify-center rounded-lg text-center", s.soft, s.text, size === "lg" ? "size-24 gap-0.5" : "h-16 w-full gap-0")}
      aria-label={`${s.label}${showScore ? `, ${score} out of 100` : ""}`}
    >
      <span aria-hidden className={cn("leading-none font-semibold tabular-nums", size === "lg" ? "text-3xl" : "text-xl")}>
        {showScore ? score : tier === "excluded" ? "✕" : "–"}
      </span>
      <span aria-hidden className={cn("px-1 leading-tight font-medium", size === "lg" ? "text-xs" : "text-[0.68rem]")}>
        {s.label}
      </span>
    </div>
  );
}

/** The fit as a small pill for list rows: "Strong match 86". The full block (FitScore) is for the detail page. */
export function FitChip({ tier, score }: { tier: TierKey; score: number | null }) {
  const s = TIER_STYLE[tier];
  const showScore = score !== null && tier !== "excluded" && tier !== "unchecked";
  return (
    <span
      className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap", s.soft, s.text)}
      aria-label={`${s.label}${showScore ? `, ${score} out of 100` : ""}`}
    >
      <span aria-hidden className={cn("size-1.5 rounded-full", s.dot)} />
      <span aria-hidden>{s.label}</span>
      {showScore ? (
        <span aria-hidden className="font-semibold tabular-nums">
          {score}
        </span>
      ) : null}
    </span>
  );
}

/** Where a posting came from. */
export function SourceTag({ source, className }: { source: JobSource; className?: string }) {
  const Icon = source.kind === "pasted" ? ClipboardPaste : Globe;
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-xs text-muted-foreground", className)}>
      <Icon aria-hidden className="size-3.5" />
      <span>
        <span className="font-medium text-foreground">{source.label}</span> · {source.detail}
      </span>
    </span>
  );
}

const VERIFICATION_STYLE: Record<string, { label: string; className: string; title: string }> = {
  verified: { label: "Verified", className: "bg-success-soft text-success", title: "Listed by the source and the link checks out." },
  pending_validation: { label: "Not yet verified", className: "bg-muted text-muted-foreground", title: "We couldn't confirm this link yet." },
  expired: { label: "Expired", className: "bg-danger-soft text-destructive", title: "This job posting is no longer accepting applications." },
  unavailable: { label: "Link unavailable", className: "bg-warning-soft text-warning", title: "The link to this listing isn't available or working." },
  failed_validation: { label: "Failed verification", className: "bg-danger-soft text-destructive", title: "The link didn't pass our checks." },
};

/** Whether a listing's link was verified, said plainly; never "verified" without evidence. */
export function VerificationBadge({ status, className }: { status: string; className?: string }) {
  const s = VERIFICATION_STYLE[status] ?? VERIFICATION_STYLE.pending_validation;
  return (
    <span title={s.title} className={cn("inline-flex w-fit items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium", s.className, className)}>
      {s.label}
    </span>
  );
}
