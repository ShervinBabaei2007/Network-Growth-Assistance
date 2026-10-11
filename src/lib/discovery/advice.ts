import type { NetworkingCriteria } from "./criteria";

/**
 * Suggestions for a search with no (or few) verified matches, based on what
 * actually held people back, most common reason first. Never "lower the bar":
 * only ways to broaden the request or look at weaker matches knowingly.
 */
export function emptyAdvice(criteria: NetworkingCriteria | null, people: { tierReason: string | null; program: string | null }[], possibleCount: number): string[] {
  const counts = { program: 0, role: 0, company: 0, location: 0, graduation: 0, school: 0 };
  for (const p of people) {
    const r = (p.tierReason ?? "").toLowerCase();
    if (/program/.test(r)) counts.program++;
    if (/\brole\b/.test(r)) counts.role++;
    if (/company/.test(r)) counts.company++;
    if (/location/.test(r)) counts.location++;
    if (/graduation/.test(r)) counts.graduation++;
    if (/school/.test(r)) counts.school++;
  }
  const program = criteria?.education.programs[0] ?? null;
  const eceInstead = people.filter((p) => /electrical and computer/i.test(p.program ?? "")).length;
  const tips: { weight: number; text: string }[] = [];

  if (counts.program || eceInstead) {
    const ece = program && /computer engineering|electrical engineering/i.test(program) && !criteria?.education.broadenEce && eceInstead > 0;
    tips.push({
      weight: Math.max(counts.program, eceInstead),
      text: ece
        ? `${eceInstead} ${eceInstead === 1 ? "person lists" : "people list"} “Electrical and Computer Engineering” rather than ${program}. Try broadening ${program} → ECE.`
        : "The program couldn't be confirmed for many people. Try related program names.",
    });
  }
  if (counts.role) tips.push({ weight: counts.role, text: `${counts.role} ${counts.role === 1 ? "person's" : "people's"} public pages don't state a current job title. Try without a role, or review the possible matches.` });
  if (counts.company) tips.push({ weight: counts.company, text: "Employers often aren't stated publicly. Try removing the company filter or adding “or startups”." });
  if (counts.location || (criteria?.locations.length && !counts.location && possibleCount)) {
    tips.push({
      weight: counts.location || 1,
      text: criteria?.locations.length
        ? "Cities are often missing from public pages. Try without a city."
        : `${counts.location} ${counts.location === 1 ? "person's" : "people's"} public pages don't say where they live, so they can't be confirmed in ${criteria?.country ?? "the country"}. They're listed as possible matches; check their profiles.`,
    });
  }
  if (counts.graduation) tips.push({ weight: counts.graduation, text: "Graduation years are rarely public. Try without a year range." });
  if (counts.school && counts.school >= people.length / 2) tips.push({ weight: counts.school, text: "Most people found couldn't be tied to the school. Check the school's name and its common short forms." });

  const out = tips.sort((a, b) => b.weight - a.weight).map((t) => t.text);
  if (possibleCount) out.push(`There ${possibleCount === 1 ? "is 1 possible match" : `are ${possibleCount} possible matches`} with weaker evidence below.`);
  if (!out.length) out.push("Try a broader request (fewer criteria), or run the search again later; public sources change.");
  return out;
}
