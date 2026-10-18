// Provinces and territories. No Zod here, so pages that only need the list stay light in the browser.

/** Provinces and territories, alphabetical by name (none is preferred over another). */
export const PROVINCE_CODES = ["AB", "BC", "MB", "NB", "NL", "NT", "NS", "NU", "ON", "PE", "QC", "SK", "YT"] as const;
export type ProvinceCode = (typeof PROVINCE_CODES)[number];

export const PROVINCE_NAMES: Record<ProvinceCode, string> = {
  BC: "British Columbia",
  ON: "Ontario",
  AB: "Alberta",
  QC: "Quebec",
  MB: "Manitoba",
  SK: "Saskatchewan",
  NS: "Nova Scotia",
  NB: "New Brunswick",
  NL: "Newfoundland and Labrador",
  PE: "Prince Edward Island",
  YT: "Yukon",
  NT: "Northwest Territories",
  NU: "Nunavut",
};
