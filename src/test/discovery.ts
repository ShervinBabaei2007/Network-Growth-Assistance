import type { NetworkingCriteria } from "@/lib/discovery/criteria";
import { parseRequestDeterministic } from "@/lib/discovery/parse-request";
import { clean, has } from "@/lib/text/match";
import { TEST_CATALOG } from "./catalog";

// What the AI's reading of a request would add, for test requests only.
const ROLES: [RegExp, string[]][] = [[/software engineers?|software developers?/i, ["Software Engineer", "Software Developer"]]];
const COMPANIES = ["NVIDIA", "AMD", "Microsoft", "Amazon", "Apple", "Shopify"];
const PLACES = ["Toronto", "Vancouver"];

/**
 * Criteria for a test request, as a search would have them: read against the test user's own
 * schools and disciplines (TEST_CATALOG), with the roles, companies and cities the request names.
 */
export function testCriteria(query: string, over: Partial<NetworkingCriteria> = {}): NetworkingCriteria {
  const c = parseRequestDeterministic(query, TEST_CATALOG);
  const t = clean(query);
  const roles = ROLES.flatMap(([re, rs]) => (re.test(query) ? rs : []));
  const companies = COMPANIES.filter((x) => has(t, clean(x).trim()));
  const places = PLACES.filter((x) => new RegExp(`\\bin (?:[A-Za-z]+ or )?${x}\\b`).test(query));
  return {
    ...c,
    roles: roles.length ? roles : c.roles,
    companies: companies.length ? companies : c.companies.filter((x) => !PLACES.includes(x)),
    locations: places.length ? places : [],
    ...over,
  };
}
