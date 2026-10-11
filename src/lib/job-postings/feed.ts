/** Role nouns that mean the same job on different boards. */
const ROLE_SYNONYMS: string[][] = [
  ["developer", "engineer", "programmer"],
  ["technician", "technologist"],
  ["analyst", "specialist"],
];

/** "Junior Software Developer" → "junior & software & (developer | engineer | programmer)", ORed across titles. */
export function titleQuery(titles: string[]): string | null {
  const parts = titles
    .map((t) =>
      t
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter((w) => w.length > 1 && !["and", "or", "the", "of", "for", "in"].includes(w))
        .map((w) => {
          const group = ROLE_SYNONYMS.find((g) => g.includes(w));
          return group ? `(${group.join(" | ")})` : w;
        })
        .join(" & "),
    )
    .filter(Boolean);
  return parts.length ? parts.map((p) => `(${p})`).join(" | ") : null;
}

/** How far back the feed looks. The 24-hour view is the default. */
export const RANGES = [
  { key: "1d", label: "24 hours", heading: "the last 24 hours", hours: 24 },
  { key: "7d", label: "Week", heading: "the past week", hours: 24 * 7 },
  { key: "30d", label: "Month", heading: "the past month", hours: 24 * 30 },
  { key: "90d", label: "3 months", heading: "the past 3 months", hours: 24 * 90 },
] as const;
export type Range = (typeof RANGES)[number];

export function parseRange(value: string | undefined): Range {
  return RANGES.find((r) => r.key === value) ?? RANGES[0];
}

export const rangeSince = (range: Range, now = Date.now()) => new Date(now - range.hours * 3600_000).toISOString();
