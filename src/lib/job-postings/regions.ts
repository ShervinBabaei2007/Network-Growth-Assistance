import type { ProvinceCode } from "./types";

/** Provinces in priority order: British Columbia first, then Ontario. */
export const PROVINCE_PRIORITY: ProvinceCode[] = ["BC", "ON", "AB", "QC", "MB", "SK", "NS", "NB", "NL", "PE", "YT", "NT", "NU"];

export const DEFAULT_PROVINCES: ProvinceCode[] = ["BC", "ON"];

/** Provinces sorted by priority, so BC and Ontario always come first. */
export function byPriority(provinces: readonly string[]): ProvinceCode[] {
  return PROVINCE_PRIORITY.filter((p) => provinces.includes(p));
}
