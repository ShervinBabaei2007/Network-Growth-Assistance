import { provinceOf } from "@/lib/discovery/location";
import { clean } from "@/lib/text/match";

/**
 * Countries and world regions, for a worldwide job search. A job's "scope" is where it can
 * be done: ISO country codes ("CA", "US"), world-region tokens ("europe", "latam") for
 * remote jobs open to a region, and "*" for remote jobs open anywhere. Nothing is
 * guessed: a place this can't read has no scope.
 */

// ISO 3166-1 alpha-2, every assigned code.
const ISO = `AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW`.split(" ");
export const COUNTRY_CODES: readonly string[] = ISO;
const ISO_SET = new Set(ISO);

/** "*": remote jobs open to anyone, anywhere. */
export const ANYWHERE = "*";

let names: Intl.DisplayNames | null = null;
/** "CA" → "Canada". */
export function countryName(code: string | null | undefined): string | null {
  if (!code) return null;
  if (code === ANYWHERE) return "Anywhere (remote)";
  try {
    names ??= new Intl.DisplayNames(["en"], { type: "region" });
    return names.of(code.toUpperCase()) ?? null;
  } catch {
    return null;
  }
}

export const isCountryCode = (code: string | null | undefined): code is string => Boolean(code && ISO_SET.has(code.toUpperCase()));

/** Every country, sorted by name, for pickers. */
export function countryOptions(): { code: string; name: string }[] {
  return ISO.filter((c) => !["AQ", "BV", "HM", "TF", "UM", "GS", "IO"].includes(c))
    .map((code) => ({ code, name: countryName(code) ?? code }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

// ------------------------------------------------------------------ world regions

const EUROPE = "AD AL AT AX BA BE BG BY CH CY CZ DE DK EE ES FI FO FR GB GG GI GR HR HU IE IM IS IT JE LI LT LU LV MC MD ME MK MT NL NO PL PT RO RS RU SE SI SJ SK SM UA VA XK".split(" ");
const MIDDLE_EAST = "AE BH EG IL IQ IR JO KW LB OM PS QA SA SY TR YE".split(" ");
const AFRICA = "AO BF BI BJ BW CD CF CG CI CM CV DJ DZ EG EH ER ET GA GH GM GN GQ GW KE KM LR LS LY MA MG ML MR MU MW MZ NA NE NG RE RW SC SD SH SL SN SO SS ST SZ TD TG TN TZ UG YT ZA ZM ZW".split(" ");
const NORTH_AMERICA = "US CA MX".split(" ");
const LATAM = "AR BO BR BZ CL CO CR CU DO EC GT HN HT MX NI PA PE PR PY SV UY VE JM TT BS BB".split(" ");
const ASIA = "AF AM AZ BD BN BT CN GE HK ID IN JP KG KH KP KR KZ LA LK MM MN MO MV MY NP PH PK SG TH TJ TL TM TW UZ VN".split(" ");
const OCEANIA = "AU NZ FJ PG SB VU WS TO KI FM MH PW NR TV NC PF GU".split(" ");

/** Region tokens and the countries in each. A remote job "open to EMEA" is open to each of them. */
export const REGIONS: Record<string, readonly string[]> = {
  europe: EUROPE,
  "middle-east": MIDDLE_EAST,
  africa: AFRICA,
  emea: [...EUROPE, ...MIDDLE_EAST, ...AFRICA],
  "north-america": NORTH_AMERICA,
  latam: LATAM,
  americas: [...new Set([...NORTH_AMERICA, ...LATAM])],
  asia: ASIA,
  oceania: OCEANIA,
  apac: [...ASIA, ...OCEANIA],
};

/** The region tokens a country belongs to: "DE" → ["europe", "emea"]. */
export function regionsOf(code: string): string[] {
  return Object.entries(REGIONS)
    .filter(([, members]) => members.includes(code))
    .map(([token]) => token);
}

/**
 * What a job's scope must overlap to be open to someone in this country: the country,
 * its regions and "anywhere". "*" alone (the Anywhere choice) means remote-anywhere jobs only.
 */
export function scopeFor(country: string): string[] {
  return country === ANYWHERE ? [ANYWHERE] : [country, ...regionsOf(country), ANYWHERE];
}

// ------------------------------------------------------------------ reading places

const ALIASES: Record<string, string> = {
  usa: "US", "u s a": "US", "u s": "US", us: "US", "united states of america": "US", america: "US",
  uk: "GB", "u k": "GB", "great britain": "GB", britain: "GB", england: "GB", scotland: "GB", wales: "GB", "northern ireland": "GB",
  uae: "AE", deutschland: "DE", holland: "NL", "the netherlands": "NL", korea: "KR", "south korea": "KR", "republic of korea": "KR",
  "czech republic": "CZ", turkey: "TR", turkiye: "TR", russia: "RU", vietnam: "VN", "viet nam": "VN", "hong kong sar": "HK",
  "ivory coast": "CI", "cote d ivoire": "CI", "dr congo": "CD", "mainland china": "CN", "prc": "CN", taiwan: "TW", macau: "MO",
  "brasil": "BR", "mexico": "MX", "méxico": "MX", "espana": "ES", "españa": "ES", "suisse": "CH", "schweiz": "CH", "osterreich": "AT",
};

const ALPHA3: Record<string, string> = {
  USA: "US", CAN: "CA", GBR: "GB", DEU: "DE", FRA: "FR", NLD: "NL", IRL: "IE", ESP: "ES", ITA: "IT", PRT: "PT", POL: "PL", SWE: "SE",
  NOR: "NO", DNK: "DK", FIN: "FI", CHE: "CH", AUT: "AT", BEL: "BE", AUS: "AU", NZL: "NZ", IND: "IN", JPN: "JP", KOR: "KR", CHN: "CN",
  SGP: "SG", HKG: "HK", ISR: "IL", ARE: "AE", BRA: "BR", MEX: "MX", ARG: "AR", COL: "CO", CHL: "CL", ZAF: "ZA", NGA: "NG", KEN: "KE",
  EGY: "EG", TUR: "TR", UKR: "UA", ROU: "RO", CZE: "CZ", HUN: "HU", GRC: "GR", PHL: "PH", IDN: "ID", MYS: "MY", THA: "TH", VNM: "VN",
  PAK: "PK", BGD: "BD", LKA: "LK", SAU: "SA", QAT: "QA", EST: "EE", LVA: "LV", LTU: "LT", SRB: "RS", HRV: "HR", SVN: "SI", SVK: "SK",
  BGR: "BG", CRI: "CR", PER: "PE", URY: "UY", TWN: "TW",
};

let byName: Map<string, string> | null = null;
/** Lower-case country names (and common aliases) → code. */
function nameIndex(): Map<string, string> {
  if (byName) return byName;
  byName = new Map();
  for (const code of ISO) {
    const n = countryName(code);
    if (n) byName.set(clean(n).trim(), code);
  }
  for (const [alias, code] of Object.entries(ALIASES)) byName.set(clean(alias).trim(), code);
  // Two-letter words that are also English or place codes ("in", "us" in prose) are only read as codes in structured fields.
  byName.delete("us");
  return byName;
}

/** A structured country field ("CA", "CAN", "Canada", "United States") → code. */
export function countryCode(value: string | null | undefined): string | null {
  const v = value?.trim();
  if (!v) return null;
  if (/^[A-Za-z]{2}$/.test(v) && ISO_SET.has(v.toUpperCase())) return v.toUpperCase();
  if (/^[A-Za-z]{3}$/.test(v) && ALPHA3[v.toUpperCase()]) return ALPHA3[v.toUpperCase()];
  return nameIndex().get(clean(v).trim()) ?? ALIASES[clean(v).trim()] ?? null;
}

const CA_PROVINCES: Record<string, string> = {
  "british columbia": "BC", ontario: "ON", alberta: "AB", quebec: "QC", québec: "QC", manitoba: "MB", saskatchewan: "SK", "nova scotia": "NS",
  "new brunswick": "NB", "newfoundland and labrador": "NL", newfoundland: "NL", "prince edward island": "PE", yukon: "YT",
  "northwest territories": "NT", nunavut: "NU",
};
const CA_CODES = ["ON", "BC", "QC", "AB", "MB", "SK", "NS", "NB", "NL", "PE", "PEI", "YT", "NT", "NU"];

const US_STATES: Record<string, string> = {
  alabama: "AL", alaska: "AK", arizona: "AZ", arkansas: "AR", california: "CA", colorado: "CO", connecticut: "CT", delaware: "DE",
  florida: "FL", georgia: "GA", hawaii: "HI", idaho: "ID", illinois: "IL", indiana: "IN", iowa: "IA", kansas: "KS", kentucky: "KY",
  louisiana: "LA", maine: "ME", maryland: "MD", massachusetts: "MA", michigan: "MI", minnesota: "MN", mississippi: "MS",
  missouri: "MO", montana: "MT", nebraska: "NE", nevada: "NV", "new hampshire": "NH", "new jersey": "NJ", "new mexico": "NM",
  "new york": "NY", "north carolina": "NC", "north dakota": "ND", ohio: "OH", oklahoma: "OK", oregon: "OR", pennsylvania: "PA",
  "rhode island": "RI", "south carolina": "SC", "south dakota": "SD", tennessee: "TN", texas: "TX", utah: "UT", vermont: "VT",
  virginia: "VA", washington: "WA", "west virginia": "WV", wisconsin: "WI", wyoming: "WY", "district of columbia": "DC",
};
const US_CODES = Object.values(US_STATES);

/** Cities that name one country on their own. Shared names (London, Vancouver, Victoria, Hamilton…) need a qualifier. */
const CITIES: Record<string, string> = {
  // Canada
  toronto: "CA", vancouver: "CA", gta: "CA", "greater toronto area": "CA", montreal: "CA", montréal: "CA", ottawa: "CA", calgary: "CA", edmonton: "CA",
  winnipeg: "CA", waterloo: "CA", kitchener: "CA", mississauga: "CA", brampton: "CA", markham: "CA", oakville: "CA", burnaby: "CA",
  surrey: "CA", coquitlam: "CA", halifax: "CA", saskatoon: "CA", regina: "CA", "quebec city": "CA", gatineau: "CA", guelph: "CA",
  kelowna: "CA", "north york": "CA", etobicoke: "CA", "lower mainland": "CA", "metro vancouver": "CA", "greater vancouver": "CA",
  // United States
  "san francisco": "US", "sf bay area": "US", "bay area": "US", "silicon valley": "US", seattle: "US", "new york city": "US", nyc: "US",
  boston: "US", austin: "US", "los angeles": "US", "san jose": "US", "san diego": "US", "mountain view": "US", "palo alto": "US",
  sunnyvale: "US", cupertino: "US", redmond: "US", "menlo park": "US", "santa clara": "US", chicago: "US", atlanta: "US", denver: "US",
  pittsburgh: "US", philadelphia: "US", houston: "US", dallas: "US", miami: "US", "washington dc": "US", "washington d c": "US",
  phoenix: "US", "salt lake city": "US", nashville: "US", minneapolis: "US", detroit: "US", "las vegas": "US", "new york": "US",
  // Europe
  berlin: "DE", munich: "DE", münchen: "DE", hamburg: "DE", frankfurt: "DE", cologne: "DE", paris: "FR", lyon: "FR", amsterdam: "NL",
  rotterdam: "NL", zurich: "CH", zürich: "CH", geneva: "CH", dublin: "IE", stockholm: "SE", copenhagen: "DK", oslo: "NO",
  helsinki: "FI", madrid: "ES", barcelona: "ES", lisbon: "PT", porto: "PT", milan: "IT", rome: "IT", warsaw: "PL", krakow: "PL",
  kraków: "PL", prague: "CZ", vienna: "AT", brussels: "BE", budapest: "HU", bucharest: "RO", athens: "GR", tallinn: "EE",
  riga: "LV", vilnius: "LT", kyiv: "UA", kiev: "UA", edinburgh: "GB", manchester: "GB", "london uk": "GB", bristol: "GB", belfast: "GB",
  glasgow: "GB", leeds: "GB", cambridge: "GB", oxford: "GB", belgrade: "RS", zagreb: "HR", sofia: "BG",
  // Asia, Oceania, Middle East, Africa, Latin America
  bangalore: "IN", bengaluru: "IN", hyderabad: "IN", mumbai: "IN", delhi: "IN", "new delhi": "IN", pune: "IN", chennai: "IN",
  gurgaon: "IN", gurugram: "IN", noida: "IN", beijing: "CN", shanghai: "CN", shenzhen: "CN", hangzhou: "CN", tokyo: "JP", osaka: "JP",
  seoul: "KR", taipei: "TW", manila: "PH", jakarta: "ID", "kuala lumpur": "MY", bangkok: "TH", "ho chi minh city": "VN", hanoi: "VN",
  sydney: "AU", melbourne: "AU", brisbane: "AU", perth: "AU", auckland: "NZ", wellington: "NZ", "tel aviv": "IL", jerusalem: "IL",
  dubai: "AE", "abu dhabi": "AE", riyadh: "SA", doha: "QA", istanbul: "TR", cairo: "EG", lagos: "NG", nairobi: "KE",
  "cape town": "ZA", johannesburg: "ZA", karachi: "PK", lahore: "PK", dhaka: "BD", "sao paulo": "BR", "são paulo": "BR",
  "rio de janeiro": "BR", "mexico city": "MX", "ciudad de mexico": "MX", guadalajara: "MX", "buenos aires": "AR", santiago: "CL",
  bogota: "CO", bogotá: "CO", medellin: "CO", medellín: "CO", lima: "PE", montevideo: "UY", "san josé": "CR",
};

const REGION_WORDS: [RegExp, string][] = [
  [/\bemea\b/, "emea"],
  [/\b(europe|european union|eu)\b/, "europe"],
  [/\b(latam|latin america|south america|central america)\b/, "latam"],
  [/\b(north(ern)? america)\b/, "north-america"],
  [/\bamericas\b/, "americas"],
  [/\b(apac|asia pacific)\b/, "apac"],
  [/\basia\b/, "asia"],
  [/\b(oceania|australasia)\b/, "oceania"],
  [/\b(middle east|mena)\b/, "middle-east"],
  [/\bafrica\b/, "africa"],
];
const ANYWHERE_WORDS = /\b(anywhere|worldwide|world wide|global(ly)?|international|any location|all locations)\b/;

const codeAfterComma = (raw: string, codes: string[]) =>
  codes.find((c) => new RegExp(`(?:,|\\s-)\\s*${c}(?:\\b|$)(?![a-z])`).test(raw) || new RegExp(`^${c}$`).test(raw.trim())) ?? null;

export type ReadPlace = {
  /** Where it can be done: country codes, region tokens, "*". Empty when unreadable. */
  scope: string[];
  /** The one physical country, when there is one. */
  country: string | null;
  /** Canadian province or US state code, when stated. */
  region: string | null;
  city: string | null;
};

/**
 * Reads one place: structured fields first ("country": "US" beats the text), then the
 * text: "anywhere", country names, Canadian provinces, US states, world regions, then
 * cities that name one country. "Vancouver, WA" is the US; "London" alone is unknown.
 */
export function readPlace(p: { text: string; city?: string | null; region?: string | null; country?: string | null }): ReadPlace {
  const raw = [p.city, p.region, p.text].filter(Boolean).join(", ");
  const t = ` ${clean(raw).trim()} `;
  const city = p.city?.trim() || cityFrom(p.text);
  const structured = countryCode(p.country);
  const usSignal =
    /\bUSA\b|\bU\.S\.|(^|[\s,(/-])US([\s,)/-]|$)|united states/i.test(raw) ||
    Boolean(codeAfterComma(raw, US_CODES)) ||
    Object.entries(CITIES).some(([name, code]) => code === "US" && t.includes(` ${clean(name).trim()} `));
  const regionCode = (country: string | null) => {
    const r = p.region?.trim().toUpperCase();
    if (country === "CA") return provinceOf(r && CA_CODES.includes(r) ? r : null, p.city, p.text) ?? caProvince(raw);
    if (country === "US") return r && US_CODES.includes(r) ? r : usState(raw, true);
    return null;
  };
  if (structured) return { scope: [structured], country: structured, region: regionCode(structured), city };

  const scope = new Set<string>();
  if (ANYWHERE_WORDS.test(t)) scope.add(ANYWHERE);
  const state = usState(raw, usSignal);
  // US state names that contain a country's name ("New Mexico", "New Jersey", "Georgia" in the US) aren't that country.
  const named = state ? t.replace(/ new mexico | new jersey /g, " ").replace(usSignal ? / georgia /g : /$^/, " ") : t;
  for (const [name, code] of nameIndex()) if (name.length > 2 && named.includes(` ${name} `)) scope.add(code);
  if (usSignal) scope.add("US");
  if (/(^|[\s,(/-])UK([\s,)/-]|$)/.test(raw)) scope.add("GB");
  if (caProvince(raw)) scope.add("CA");
  if (state) scope.add("US");
  for (const [re, token] of REGION_WORDS) if (re.test(t)) scope.add(token);
  if (![...scope].some((s) => ISO_SET.has(s))) {
    for (const name of Object.keys(CITIES).sort((a, b) => b.length - a.length)) {
      if (t.includes(` ${clean(name).trim()} `)) {
        scope.add(CITIES[name]);
        break;
      }
    }
  }
  const countries = [...scope].filter((s) => ISO_SET.has(s));
  const country = countries.length === 1 ? countries[0] : null;
  return { scope: [...scope], country, region: regionCode(country), city: country ? city : null };
}

function caProvince(raw: string): string | null {
  const t = ` ${clean(raw).trim()} `;
  for (const name of Object.keys(CA_PROVINCES).sort((a, b) => b.length - a.length)) if (t.includes(` ${clean(name).trim()} `)) return CA_PROVINCES[name];
  const code = codeAfterComma(raw, CA_CODES);
  return code ? (code === "PEI" ? "PE" : code) : null;
}

/** A US state named or coded in the text. "Georgia" counts only with another sign of the US (it's also a country). */
function usState(raw: string, usSignal: boolean): string | null {
  const t = ` ${clean(raw).trim()} `;
  if (/ washington d ?c /.test(t)) return "DC";
  for (const name of Object.keys(US_STATES).sort((a, b) => b.length - a.length)) {
    if (name === "georgia" && !usSignal && !codeAfterComma(raw, ["GA"])) continue;
    if (t.includes(` ${name} `)) return US_STATES[name];
  }
  return codeAfterComma(raw, US_CODES);
}

function cityFrom(text: string): string | null {
  const first = text.split(",")[0]?.replace(/\bremote\b|[-–()]/gi, " ").replace(/\s+/g, " ").trim();
  if (!first || first.length > 60) return null;
  // A country or region on its own isn't a city.
  if (countryCode(first) || REGION_WORDS.some(([re]) => re.test(clean(first))) || ANYWHERE_WORDS.test(clean(first))) return null;
  return first;
}

// ------------------------------------------------------------------ money

/** The currency people are usually paid in, for the salary filter. Unlisted countries get no amount filter. */
const CURRENCY: Record<string, string> = {
  CA: "CAD", US: "USD", GB: "GBP", IE: "EUR", DE: "EUR", FR: "EUR", NL: "EUR", ES: "EUR", IT: "EUR", PT: "EUR", BE: "EUR", AT: "EUR",
  FI: "EUR", GR: "EUR", EE: "EUR", LV: "EUR", LT: "EUR", SK: "EUR", SI: "EUR", HR: "EUR", CY: "EUR", MT: "EUR", LU: "EUR",
  CH: "CHF", SE: "SEK", NO: "NOK", DK: "DKK", PL: "PLN", CZ: "CZK", HU: "HUF", RO: "RON", BG: "BGN", RS: "RSD", UA: "UAH", TR: "TRY",
  AU: "AUD", NZ: "NZD", JP: "JPY", KR: "KRW", CN: "CNY", HK: "HKD", TW: "TWD", SG: "SGD", MY: "MYR", TH: "THB", PH: "PHP", ID: "IDR",
  VN: "VND", IN: "INR", PK: "PKR", BD: "BDT", IL: "ILS", AE: "AED", SA: "SAR", QA: "QAR", EG: "EGP", ZA: "ZAR", NG: "NGN", KE: "KES",
  BR: "BRL", MX: "MXN", AR: "ARS", CL: "CLP", CO: "COP", PE: "PEN", UY: "UYU", CR: "CRC",
};
export const currencyOf = (country: string | null | undefined): string | null => (country ? (CURRENCY[country] ?? null) : null);
