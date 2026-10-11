/**
 * Links that open LinkedIn in the user's own browser. The app never requests
 * these itself; the user decides what to do on LinkedIn.
 *
 * When the person published their own profile link (on GitHub, ORCID or their
 * website), that exact profile is used. Otherwise it's a LinkedIn people search
 * for their name plus their employer or school, and the user picks the right person.
 */
export function linkedInSearchUrl(p: { fullName: string; currentCompany?: string | null; institution?: string | null }): string {
  const context = p.currentCompany?.trim() || p.institution?.trim() || "";
  const keywords = [p.fullName.trim(), context].filter(Boolean).join(" ");
  return `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(keywords)}`;
}
