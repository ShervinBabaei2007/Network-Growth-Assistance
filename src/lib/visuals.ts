/**
 * The arithmetic behind the progress visuals (funnel, heatmap, goal ring, sparkline), kept apart from the markup so
 * it can be unit-tested. Nothing here estimates or smooths: every shape is drawn from counts the app really holds,
 * and a visual that has nothing to say returns null instead of an empty chart.
 */

// ------------------------------------------------------------------ funnel

export type FunnelCounts = {
  /** Everyone found. */
  discovered: number;
  /** Ever approved for outreach (includes those since invited). */
  approved: number;
  /** Invitations sent, whatever their outcome. */
  invited: number;
  /** Invitations that are still waiting for an answer; part of `invited`, not counted as accepted. */
  pending: number;
  accepted: number;
};

export type FunnelStep = {
  key: "discovered" | "approved" | "invited" | "accepted";
  label: string;
  value: number;
  /** Width of the bar, 0 to 100, relative to the first step. */
  widthPercent: number;
  /** Of the previous step, how many did not reach this one. Null for the first step or when the previous step is zero. */
  dropOffPercent: number | null;
  /** Waiting for an answer: shown hatched and never counted as reaching the next step. */
  pending: number;
};

export function buildFunnel(c: FunnelCounts): FunnelStep[] | null {
  if (c.discovered <= 0) return null;
  const raw: { key: FunnelStep["key"]; label: string; value: number; pending: number }[] = [
    { key: "discovered", label: "Discovered", value: c.discovered, pending: 0 },
    { key: "approved", label: "Approved for outreach", value: c.approved, pending: 0 },
    { key: "invited", label: "Invited", value: c.invited, pending: Math.min(c.pending, c.invited) },
    { key: "accepted", label: "Accepted", value: c.accepted, pending: 0 },
  ];
  return raw.map((s, i) => {
    const prev = i === 0 ? null : raw[i - 1].value;
    return {
      ...s,
      widthPercent: Math.min(100, Math.round((s.value / c.discovered) * 100)),
      dropOffPercent: prev === null || prev <= 0 ? null : Math.max(0, Math.round(((prev - s.value) / prev) * 100)),
    };
  });
}

// ------------------------------------------------------------------ heatmap

export type HeatCell = { date: string; count: number; level: 0 | 1 | 2 | 3 | 4 };
/** Columns are weeks (oldest first); each has seven slots, Monday to Sunday, `null` outside the period. */
export type HeatGrid = { weeks: (HeatCell | null)[][]; max: number; total: number };

const weekday = (date: string) => (new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7; // Monday = 0

/** Level 0 is "nothing"; 1 to 4 split the busiest day into quarters, so the scale always uses the full range. */
export function heatLevel(count: number, max: number): HeatCell["level"] {
  if (count <= 0 || max <= 0) return 0;
  return Math.max(1, Math.min(4, Math.ceil((count / max) * 4))) as HeatCell["level"];
}

export function buildHeatGrid(days: { date: string; count: number }[]): HeatGrid | null {
  if (days.length === 0) return null;
  const sorted = [...days].sort((a, b) => a.date.localeCompare(b.date));
  const max = Math.max(...sorted.map((d) => d.count));
  const total = sorted.reduce((n, d) => n + d.count, 0);
  if (total === 0) return null;
  const weeks: (HeatCell | null)[][] = [];
  let column: (HeatCell | null)[] = Array(7).fill(null);
  for (const d of sorted) {
    const row = weekday(d.date);
    if (row === 0 && column.some((c) => c !== null)) {
      weeks.push(column);
      column = Array(7).fill(null);
    }
    column[row] = { date: d.date, count: d.count, level: heatLevel(d.count, max) };
  }
  weeks.push(column);
  return { weeks, max, total };
}

// ------------------------------------------------------------------ goal ring

export type RingArcs = {
  /** Fractions of the full circle, 0 to 1. The pending arc starts where the accepted arc ends and never passes the top. */
  accepted: number;
  pending: number;
  /** Whole-number percent of the goal reached by accepted connections only. */
  percent: number;
};

export function ringArcs(accepted: number, pending: number, target: number): RingArcs | null {
  if (!(target > 0)) return null;
  const a = Math.min(1, Math.max(0, accepted) / target);
  const p = Math.min(1 - a, Math.max(0, pending) / target);
  return { accepted: a, pending: p, percent: Math.round(a * 100) };
}

// ------------------------------------------------------------------ sparkline

export type Sparkline = { points: string; last: { x: number; y: number }; min: number; max: number };

/** Points for an SVG polyline in a width x height box. Null for fewer than two points or a series with no variation worth drawing. */
export function sparkline(values: number[], width = 80, height = 24, pad = 2): Sparkline | null {
  if (values.length < 2) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  if (max === 0) return null;
  const span = max - min || 1;
  const x = (i: number) => pad + (i / (values.length - 1)) * (width - pad * 2);
  const y = (v: number) => height - pad - ((v - min) / span) * (height - pad * 2);
  const pts = values.map((v, i) => ({ x: Math.round(x(i) * 10) / 10, y: Math.round(y(v) * 10) / 10 }));
  return { points: pts.map((p) => `${p.x},${p.y}`).join(" "), last: pts[pts.length - 1], min, max };
}
