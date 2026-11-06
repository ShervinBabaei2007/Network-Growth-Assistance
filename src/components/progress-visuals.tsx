import { useId } from "react";
import { getT } from "@/lib/i18n/server";
import { MeterLegend } from "@/components/meter-legend";
import { ringArcs, sparkline, type FunnelStep, type HeatGrid } from "@/lib/visuals";
import { cn } from "@/lib/utils";

/*
 * Progress visuals as plain SVG and CSS: server-rendered, no chart library and no client JavaScript, so they add
 * nothing to a page's first load. Every one has the same information in words beside it (and, for the charts, a table
 * on the page), and the hatched "pending, not counted" treatment is the same one the progress bars use, so a visual
 * never shows waiting invitations as if they were accepted. Colours are the --meter-* tokens, checked in both themes
 * by contrast.test.ts.
 */

const HATCH = "repeating-linear-gradient(135deg, transparent 0 2px, rgb(255 255 255 / 55%) 2px 4px)";

// ------------------------------------------------------------------ funnel

/** Discovered → approved → invited → accepted, with how many dropped out at each step. */
export async function Funnel({ steps }: { steps: FunnelStep[] }) {
  const t = await getT();
  return (
    <div className="grid gap-3">
      <ol className="grid gap-3" aria-label={t("visuals.funnelAria")}>
        {steps.map((s) => {
          const waitingShare = s.value > 0 ? Math.round((s.pending / s.value) * 100) : 0;
          return (
            <li key={s.key} className="grid gap-1" data-testid={`funnel-${s.key}`}>
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 text-sm">
                <span className="font-medium">{t(`funnel.${s.key}`)}</span>
                <span className="tabular-nums text-muted-foreground">
                  {s.value.toLocaleString("en-CA")}
                  {s.pending ? ` · ${s.pending.toLocaleString("en-CA")} ${t("visuals.waiting")}` : ""}
                  {s.dropOffPercent !== null ? ` · ${t("visuals.didntContinue", { percent: s.dropOffPercent })}` : ""}
                </span>
              </div>
              <div className="h-3 rounded-full bg-meter-track" aria-hidden>
                <div className="flex h-full overflow-hidden rounded-full" style={{ width: `${Math.max(s.widthPercent, s.value > 0 ? 2 : 0)}%` }}>
                  <div className="h-full bg-meter-fill" style={{ width: `${100 - waitingShare}%` }} />
                  {waitingShare ? <div className="h-full bg-meter-pending" style={{ width: `${waitingShare}%`, backgroundImage: HATCH }} /> : null}
                </div>
              </div>
            </li>
          );
        })}
      </ol>
      <MeterLegend />
    </div>
  );
}

// ------------------------------------------------------------------ heatmap

const LEVEL_MIX = [0, 28, 52, 76, 100] as const;

/** Activity per day over the period: columns are weeks, rows are Monday to Sunday. */
export async function ActivityHeatmap({ grid, label }: { grid: HeatGrid; label: string }) {
  const t = await getT();
  const days = [t("visuals.mon"), t("visuals.tue"), t("visuals.wed"), t("visuals.thu"), t("visuals.fri"), t("visuals.sat"), t("visuals.sun")];
  return (
    <div className="grid gap-2">
      <div role="img" aria-label={label} className="flex items-start gap-2 overflow-x-auto pb-1">
        <div aria-hidden className="grid grid-rows-7 gap-1 pt-0.5 text-[0.65rem] leading-none text-muted-foreground">
          {days.map((d, i) => (
            <span key={d} className="flex h-5 items-center">
              {i % 2 === 0 ? d : ""}
            </span>
          ))}
        </div>
        <div className="flex gap-1">
          {grid.weeks.map((week, w) => (
            <div key={w} className="grid grid-rows-7 gap-1">
              {week.map((cell, r) =>
                cell ? (
                  <span
                    key={r}
                    title={`${cell.date}: ${cell.count}`}
                    className="size-5 rounded-[4px] border border-border/80"
                    style={{ background: `color-mix(in oklab, var(--meter-fill) ${LEVEL_MIX[cell.level]}%, var(--meter-track))` }}
                  />
                ) : (
                  <span key={r} className="size-5" />
                ),
              )}
            </div>
          ))}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground" aria-hidden>
        {t("visuals.less")}
        {LEVEL_MIX.map((m) => (
          <span key={m} className="size-3.5 rounded-[3px] border border-border/80" style={{ background: `color-mix(in oklab, var(--meter-fill) ${m}%, var(--meter-track))` }} />
        ))}
        {t("visuals.moreBusiest", { max: grid.max })}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ goal ring

const R = 50;
const C = 2 * Math.PI * R;

/** The goal as a ring: accepted in solid colour, pending after it hatched (so it reads as "not yet"). */
export function GoalRing({ accepted, pending = 0, target, label, className }: { accepted: number; pending?: number; target: number; label: string; className?: string }) {
  const arcs = ringArcs(accepted, pending, target);
  const hatchId = useId();
  if (!arcs) return null;
  return (
    <div
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={arcs.percent}
      aria-valuetext={`${accepted.toLocaleString("en-CA")} of ${target.toLocaleString("en-CA")} accepted${pending ? `, ${pending.toLocaleString("en-CA")} pending` : ""}`}
      className={cn("relative size-36 shrink-0", className)}
      data-testid="goal-ring"
    >
      <svg viewBox="0 0 120 120" aria-hidden className="size-full -rotate-90">
        <defs>
          <pattern id={hatchId} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width="6" height="6" style={{ fill: "var(--meter-pending)" }} />
            <line x1="0" y1="0" x2="0" y2="6" stroke="white" strokeOpacity="0.55" strokeWidth="2" />
          </pattern>
        </defs>
        <circle cx="60" cy="60" r={R} fill="none" strokeWidth="12" style={{ stroke: "var(--meter-track)" }} />
        {arcs.pending > 0 ? <circle cx="60" cy="60" r={R} fill="none" strokeWidth="12" stroke={`url(#${hatchId})`} strokeDasharray={`${arcs.pending * C} ${C}`} strokeDashoffset={-arcs.accepted * C} /> : null}
        {arcs.accepted > 0 ? <circle cx="60" cy="60" r={R} fill="none" strokeWidth="12" strokeLinecap="butt" strokeDasharray={`${arcs.accepted * C} ${C}`} style={{ stroke: "var(--meter-fill)" }} /> : null}
      </svg>
      <div aria-hidden className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <span className="text-3xl leading-none font-semibold tabular-nums">{arcs.percent}%</span>
        <span className="mt-1 text-xs text-muted-foreground">of the goal</span>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ sparkline

/** A tiny trend line for a stat tile. Decorative: the tile's number and text carry the meaning. */
export function Sparkline({ values, className }: { values: number[]; className?: string }) {
  const s = sparkline(values);
  if (!s) return null;
  return (
    <svg viewBox="0 0 80 24" aria-hidden className={cn("h-6 w-20 text-primary", className)}>
      <polyline points={s.points} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={s.last.x} cy={s.last.y} r="2" fill="currentColor" />
    </svg>
  );
}
