import { STAGES, type Stage } from "./stages";

/** Sorting for the list view. Missing dates always sort last, whichever the direction. */
export const SORT_KEYS = ["updated", "stage", "company", "title", "applied"] as const;
export type SortKey = (typeof SORT_KEYS)[number];
export type SortDir = "asc" | "desc";

export type SortableApplication = {
  stage: Stage;
  company: string | null;
  title: string;
  appliedOn: string | null;
  stageChangedAt: string;
};

export function parseSort(key: string | undefined, dir: string | undefined): { key: SortKey; dir: SortDir } {
  const k = (SORT_KEYS as readonly string[]).includes(key ?? "") ? (key as SortKey) : "updated";
  const d: SortDir = dir === "asc" || dir === "desc" ? dir : k === "updated" || k === "applied" ? "desc" : "asc";
  return { key: k, dir: d };
}

const text = (a: string | null, b: string | null) => (a ?? "").localeCompare(b ?? "", "en", { sensitivity: "base" });

export function sortApplications<T extends SortableApplication>(apps: T[], key: SortKey, dir: SortDir): T[] {
  const sign = dir === "asc" ? 1 : -1;
  const compare = (a: T, b: T): number => {
    switch (key) {
      case "stage":
        return sign * (STAGES.indexOf(a.stage) - STAGES.indexOf(b.stage));
      case "company":
        if (!a.company !== !b.company) return a.company ? -1 : 1;
        return sign * text(a.company, b.company);
      case "title":
        return sign * text(a.title, b.title);
      case "applied":
        if (!a.appliedOn !== !b.appliedOn) return a.appliedOn ? -1 : 1;
        return sign * text(a.appliedOn, b.appliedOn);
      default:
        return sign * (Date.parse(a.stageChangedAt) - Date.parse(b.stageChangedAt));
    }
  };
  // Ties fall back to the most recent change, so the order is stable between reloads.
  return [...apps].sort((a, b) => compare(a, b) || Date.parse(b.stageChangedAt) - Date.parse(a.stageChangedAt) || text(a.title, b.title));
}
