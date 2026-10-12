import { ANYWHERE, countryName } from "@/lib/geo/countries";

/**
 * Links that open the same search on LinkedIn, Indeed, Glassdoor and Google Jobs, in the
 * user's own browser. The app never fetches these sites (they offer no public job-search
 * API, and scraping them breaks their terms); the user browses them and can bring a job
 * back with "Paste a posting". Each link is the site's own public search address with the
 * words filled in, nothing more.
 */

export type ExternalSearch = { site: "linkedin" | "indeed" | "glassdoor" | "google"; label: string; url: string };

/** Indeed's country sites; anywhere else uses www.indeed.com with the country as the place. */
const INDEED_HOSTS: Record<string, string> = {
  CA: "ca.indeed.com", GB: "uk.indeed.com", AU: "au.indeed.com", IN: "in.indeed.com", DE: "de.indeed.com", FR: "fr.indeed.com",
  NL: "nl.indeed.com", IE: "ie.indeed.com", SG: "sg.indeed.com", NZ: "nz.indeed.com", ZA: "za.indeed.com", ES: "es.indeed.com",
  IT: "it.indeed.com", BR: "br.indeed.com", MX: "mx.indeed.com", CH: "ch.indeed.com", AT: "at.indeed.com", BE: "be.indeed.com",
  PL: "pl.indeed.com", SE: "se.indeed.com", JP: "jp.indeed.com", AE: "ae.indeed.com", PH: "ph.indeed.com", MY: "malaysia.indeed.com",
};

export function externalSearchLinks(q: { what: string; where: string | null; country: string }): ExternalSearch[] {
  const what = q.what.trim();
  if (!what) return [];
  const anywhere = q.country === ANYWHERE;
  const country = anywhere ? null : countryName(q.country);
  // The place each site is asked for: the city or region typed, else the country; "Remote" for Anywhere.
  const place = q.where?.trim() ? [q.where.trim(), country].filter(Boolean).join(", ") : anywhere ? "Remote" : (country ?? "");
  const indeedHost = (!anywhere && INDEED_HOSTS[q.country]) || "www.indeed.com";
  // On a country's own Indeed site the country is implied; elsewhere it's part of the place.
  const indeedPlace = indeedHost === "www.indeed.com" ? place : q.where?.trim() || "";
  const params = (p: Record<string, string>) => new URLSearchParams(Object.entries(p).filter(([, v]) => v)).toString();
  return [
    { site: "linkedin", label: "LinkedIn", url: `https://www.linkedin.com/jobs/search/?${params({ keywords: what, location: place })}` },
    { site: "indeed", label: "Indeed", url: `https://${indeedHost}/jobs?${params({ q: what, l: indeedPlace })}` },
    { site: "glassdoor", label: "Glassdoor", url: `https://www.glassdoor.com/Job/jobs.htm?${params({ "sc.keyword": what, locKeyword: place })}` },
    { site: "google", label: "Google Jobs", url: `https://www.google.com/search?${params({ q: `${what} jobs${place ? ` ${place}` : ""}`, ibp: "htl;jobs" })}` },
  ];
}
