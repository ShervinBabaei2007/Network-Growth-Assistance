import { TIER_STYLE, type TierKey } from "@/components/jobs/job-visuals";
import type { BreakdownRow, PayBar } from "@/lib/job-postings/fit-breakdown";
import { cn } from "@/lib/utils";

/**
 * Why the fit is what it is, as bars. Plain CSS (no chart library, no client JavaScript): the numbers and the
 * Matches / Missing lists come from the same requirement results as the score, and every bar has the same
 * information as words beside it, so nothing depends on colour or on seeing the bar.
 */
export function FitBreakdown({ rows, tier }: { rows: BreakdownRow[]; tier: TierKey }) {
  if (rows.length === 0) return null;
  const fill = TIER_STYLE[tier].dot;
  return (
    <section aria-label="Why this fit" className="grid gap-2 rounded-lg border bg-muted/40 p-3">
      <h3 className="text-xs font-semibold text-foreground">Why this fit</h3>
      <ul className="grid gap-2.5">
        {rows.map((r) => (
          <li key={r.key} className="grid gap-1">
            <div className="flex items-baseline justify-between gap-3 text-xs">
              <span className="font-medium text-foreground">{r.label}</span>
              <span className="tabular-nums text-muted-foreground">
                {r.met} of {r.total} met{r.partial ? `, ${r.partial} partly` : ""}
              </span>
            </div>
            <div role="meter" aria-label={r.label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={r.percent} aria-valuetext={`${r.met} of ${r.total} met`} className="h-1.5 overflow-hidden rounded-full bg-muted">
              <div className={cn("h-full rounded-full", fill)} style={{ width: `${Math.max(r.percent, r.percent > 0 ? 4 : 0)}%` }} />
            </div>
            {r.strong.length || r.missing.length || r.preferredNotFound.length ? (
              <p className="text-xs text-muted-foreground">
                {r.strong.length ? <>Matches: {r.strong.slice(0, 4).join(", ")}. </> : null}
                {r.missing.length ? <>Missing: {r.missing.slice(0, 3).join(", ")}. </> : null}
                {r.preferredNotFound.length ? <>Preferred not found: {r.preferredNotFound.slice(0, 2).join(", ")}.</> : null}
              </p>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}

const money = (n: number, currency: string | null) => `${currency ? `${currency} ` : ""}${Math.round(n).toLocaleString("en-CA")}`;

/** The stated pay as a range against your own minimum. Nothing is estimated; the pay is shown per year for comparison. */
export function PayRange({ bar }: { bar: PayBar }) {
  const range = bar.low === bar.high ? money(bar.high, bar.currency) : `${money(bar.low, bar.currency)} to ${money(bar.high, bar.currency)}`;
  const verdict = bar.meetsMinimum === null ? null : bar.meetsMinimum ? "reaches your minimum" : "is below your minimum";
  return (
    <div className="grid gap-1" data-testid="pay-range">
      <div className="flex items-baseline justify-between gap-3 text-xs">
        <span className="font-medium text-foreground">Pay, per year</span>
        <span className="tabular-nums text-muted-foreground">
          {range}
          {verdict ? ` · ${verdict}` : ""}
        </span>
      </div>
      <div className="relative h-1.5 rounded-full bg-muted" aria-hidden>
        <div className="absolute inset-y-0 rounded-full bg-primary" style={{ left: `${bar.from}%`, width: `${bar.to - bar.from}%` }} />
        {bar.minMarker !== null ? <div className="absolute -top-1 h-3.5 w-0.5 rounded bg-foreground" style={{ left: `${bar.minMarker}%` }} /> : null}
      </div>
      {bar.minMarker !== null ? <p className="text-xs text-muted-foreground">The dark mark is your minimum pay.</p> : null}
    </div>
  );
}

/** Initials in a neutral circle, so a list of employers is quicker to scan. Decorative: the company name is always in the text beside it. */
export function EmployerMark({ name, iconUrl }: { name: string | null; iconUrl?: string | null }) {
  const initials = (name ?? "")
    .replace(/\b(inc|ltd|llc|corp|co|the|of|and)\b\.?/gi, "")
    .split(/[\s\-/&.,]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
  return (
    <span aria-hidden className="relative inline-flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-muted text-xs font-semibold text-muted-foreground">
      {initials || "•"}
      {/* The employer's own icon covers the initials; if it fails to load, the initials underneath remain. */}
      {iconUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- a tiny same-origin icon; the image optimiser would add nothing
        <img src={iconUrl} alt="" width={32} height={32} loading="lazy" decoding="async" className="absolute inset-0 size-full bg-background object-contain p-1" />
      ) : null}
    </span>
  );
}
