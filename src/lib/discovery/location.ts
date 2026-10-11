import { clean, hasAny } from "@/lib/text/match";

/**
 * Which country a free-text location ("Toronto", "Vancouver, BC", "Seattle, WA",
 * "Remote") points to. Explicit qualifiers (country, province, state) win over city
 * names, so "Vancouver, WA" is the United States. City names that exist in several
 * countries (London, Hamilton, Victoria…) only count with a qualifier. Unknown stays
 * unknown: nothing is guessed.
 */

export type CountryGuess = "canada" | "other" | null;

const PROVINCES = [
  "ontario", "british columbia", "quebec", "alberta", "manitoba", "saskatchewan", "nova scotia",
  "new brunswick", "newfoundland", "newfoundland and labrador", "prince edward island", "yukon",
  "northwest territories", "nunavut",
];
const PROVINCE_CODES = ["ON", "BC", "QC", "AB", "MB", "SK", "NS", "NB", "NL", "PE", "PEI", "YT", "NT", "NU"];

const CANADIAN_CITIES = [
  "toronto", "gta", "greater toronto area", "vancouver", "montreal", "ottawa", "calgary", "edmonton", "winnipeg",
  "waterloo", "kitchener", "kitchener waterloo", "mississauga", "brampton", "markham", "oakville", "richmond hill",
  "vaughan", "north york", "etobicoke", "burnaby", "coquitlam", "halifax", "saskatoon", "regina", "quebec city",
  "gatineau", "guelph", "kelowna", "thunder bay", "sudbury", "barrie", "oshawa", "pickering", "ajax",
  "fredericton", "moncton", "charlottetown", "st john s", "lower mainland",
];

const US_STATE_CODES = [
  "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "FL", "GA", "HI", "ID", "IL", "IN", "IA", "KS", "KY", "LA", "ME", "MD",
  "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ", "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI", "SC",
  "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY", "DC",
];
const US_STATES = [
  "alabama", "alaska", "arizona", "arkansas", "california", "colorado", "connecticut", "delaware", "florida", "georgia",
  "hawaii", "idaho", "illinois", "indiana", "iowa", "kansas", "kentucky", "louisiana", "maine", "maryland", "massachusetts",
  "michigan", "minnesota", "mississippi", "missouri", "montana", "nebraska", "nevada", "new hampshire", "new jersey",
  "new mexico", "north carolina", "north dakota", "ohio", "oklahoma", "oregon", "pennsylvania", "rhode island",
  "south carolina", "south dakota", "tennessee", "texas", "utah", "vermont", "virginia", "washington", "west virginia",
  "wisconsin", "wyoming",
];
const COUNTRIES = [
  "united states", "usa", "u s a", "united states of america", "america", "united kingdom", "uk", "england", "scotland",
  "wales", "ireland", "germany", "deutschland", "france", "netherlands", "belgium", "switzerland", "austria", "sweden",
  "norway", "denmark", "finland", "spain", "italy", "portugal", "poland", "czechia", "czech republic", "romania",
  "hungary", "greece", "russia", "ukraine", "turkey", "israel", "india", "pakistan", "bangladesh", "sri lanka", "nepal",
  "china", "hong kong", "taiwan", "japan", "korea", "south korea", "singapore", "malaysia", "indonesia", "philippines",
  "vietnam", "thailand", "australia", "new zealand", "united arab emirates", "uae", "saudi arabia", "qatar", "egypt",
  "nigeria", "kenya", "south africa", "brazil", "mexico", "argentina", "chile", "colombia", "peru", "iran", "iraq",
];
const FOREIGN_CITIES = [
  "san francisco", "sf bay area", "bay area", "silicon valley", "seattle", "new york", "nyc", "new york city", "boston",
  "austin", "los angeles", "san jose", "san diego", "mountain view", "palo alto", "sunnyvale", "cupertino", "redmond",
  "menlo park", "santa clara", "bellevue", "chicago", "atlanta", "denver", "pittsburgh", "philadelphia", "houston",
  "dallas", "miami", "washington dc", "berlin", "munich", "paris", "amsterdam", "zurich", "dublin", "stockholm",
  "bangalore", "bengaluru", "hyderabad", "mumbai", "delhi", "new delhi", "pune", "chennai", "beijing", "shanghai",
  "shenzhen", "hangzhou", "tokyo", "seoul", "sydney", "melbourne", "tel aviv", "dubai", "lagos", "karachi", "lahore",
  "dhaka", "istanbul", "tehran", "cairo", "sao paulo", "mexico city",
];

const codeAfterComma = (raw: string, codes: string[]) =>
  codes.some((c) => new RegExp(`(?:,|\\s-)\\s*${c}(?:\\b|$)(?![a-z])`).test(raw) || new RegExp(`^${c}$`).test(raw.trim()));

export function classifyCountry(location: string | null | undefined): CountryGuess {
  const raw = (location ?? "").trim();
  if (!raw) return null;
  const t = clean(raw);
  if (hasAny(t, ["canada", "canadian"])) return "canada";
  if (hasAny(t, PROVINCES) || codeAfterComma(raw, PROVINCE_CODES)) return "canada";
  if (hasAny(t, COUNTRIES) || hasAny(t, US_STATES) || codeAfterComma(raw, US_STATE_CODES)) return "other";
  if (hasAny(t, CANADIAN_CITIES)) return "canada";
  if (hasAny(t, FOREIGN_CITIES)) return "other";
  return null;
}

/** Display name for an ISO country code (ORCID uses them): "CA" → "Canada". */
export function countryName(code: string | null | undefined): string | null {
  if (!code) return null;
  try {
    return new Intl.DisplayNames(["en"], { type: "region" }).of(code.toUpperCase()) ?? null;
  } catch {
    return null;
  }
}

/** Whether a location is in the requested country. Canada is understood in detail; other countries by name. */
export function inCountry(location: string, country: string): "in" | "out" | null {
  const guess = classifyCountry(location);
  if (/^canada$/i.test(country.trim())) return guess === "canada" ? "in" : guess === "other" ? "out" : null;
  if (clean(location).includes(clean(country))) return "in";
  return guess === "canada" ? "out" : null;
}

/** Locations to bias GitHub's user search towards, for a country. */
export function countrySearchTerms(country: string | null): string[] {
  return country && /^canada$/i.test(country.trim()) ? ["Canada", "Toronto", "Vancouver"] : country ? [country] : [];
}

const PROVINCE_BY_NAME: Record<string, string> = {
  "british columbia": "BC", ontario: "ON", alberta: "AB", quebec: "QC", manitoba: "MB", saskatchewan: "SK",
  "nova scotia": "NS", "new brunswick": "NB", "newfoundland and labrador": "NL", newfoundland: "NL",
  "prince edward island": "PE", yukon: "YT", "northwest territories": "NT", nunavut: "NU",
};

/** Cities that name one Canadian province on their own. Shared names (Victoria, Richmond, London) need a qualifier. */
const CITY_PROVINCE: Record<string, string> = {
  vancouver: "BC", burnaby: "BC", surrey: "BC", coquitlam: "BC", kelowna: "BC", "north vancouver": "BC", "west vancouver": "BC",
  "new westminster": "BC", "port coquitlam": "BC", langley: "BC", abbotsford: "BC", nanaimo: "BC", kamloops: "BC", "lower mainland": "BC",
  toronto: "ON", gta: "ON", "greater toronto area": "ON", mississauga: "ON", brampton: "ON", markham: "ON", oakville: "ON",
  "richmond hill": "ON", vaughan: "ON", "north york": "ON", etobicoke: "ON", scarborough: "ON", ottawa: "ON", waterloo: "ON",
  kitchener: "ON", "kitchener waterloo": "ON", guelph: "ON", oshawa: "ON", pickering: "ON", ajax: "ON", barrie: "ON",
  sudbury: "ON", "thunder bay": "ON", burlington: "ON",
  calgary: "AB", edmonton: "AB", montreal: "QC", "quebec city": "QC", gatineau: "QC", laval: "QC", winnipeg: "MB",
  saskatoon: "SK", regina: "SK", halifax: "NS", fredericton: "NB", moncton: "NB", "st john s": "NL", charlottetown: "PE",
  whitehorse: "YT", yellowknife: "NT", iqaluit: "NU",
};

/**
 * The two-letter Canadian province a job's location points to, or null. An explicit
 * province (code or name) wins; otherwise only an unambiguous city counts. Locations
 * outside Canada (by country or US state) give null.
 */
export function provinceOf(...parts: (string | null | undefined)[]): string | null {
  const raw = parts.filter(Boolean).join(", ").trim();
  if (!raw) return null;
  if (classifyCountry(raw) === "other") return null;
  for (const p of parts) {
    const code = p?.trim().toUpperCase();
    if (code && (PROVINCE_CODES as string[]).includes(code)) return code === "PEI" ? "PE" : code;
  }
  const t = clean(raw);
  // Longest names first so "new brunswick" isn't read as something shorter.
  for (const name of Object.keys(PROVINCE_BY_NAME).sort((a, b) => b.length - a.length)) if (t.includes(` ${name} `)) return PROVINCE_BY_NAME[name];
  for (const code of PROVINCE_CODES) {
    if (codeAfterComma(raw, [code])) return code === "PEI" ? "PE" : code;
  }
  for (const city of Object.keys(CITY_PROVINCE).sort((a, b) => b.length - a.length)) if (t.includes(` ${city} `)) return CITY_PROVINCE[city];
  return null;
}
