import { jobFixturesEnabled } from "@/lib/runtime-mode";
import { JUNIOR_DEV } from "../fixtures";
import { AdzunaProvider } from "./adzuna";
import { CareerjetProvider } from "./careerjet";
import { JobicyProvider } from "./jobicy";
import { UsajobsProvider } from "./usajobs";
import type { JobProvider } from "./types";

/**
 * The search-time job sources this server can use. Jobicy is free and needs no key, so it
 * is always on. Adzuna is optional: it is added only when its developer keys are set, and
 * nothing depends on it, and so are USAJOBS (US federal jobs; a free key) and Careerjet
 * (a free publisher key; asked only from the Jobs page, since it needs the person searching). (Remotive and
 * Arbeitnow are read by the scheduled crawl, not per search: see syncFeeds.) In fixture mode (tests and local demos only, never production) a
 * fictional Jobicy feed is used instead, with no network.
 */
export function searchProviders(env: Record<string, string | undefined> = process.env): { providers: JobProvider[] } {
  if (jobFixturesEnabled(env)) return { providers: [fixtureJobicy()] };
  const providers: JobProvider[] = [new JobicyProvider()];
  if (env.ADZUNA_APP_ID && env.ADZUNA_APP_KEY) providers.push(new AdzunaProvider(env.ADZUNA_APP_ID, env.ADZUNA_APP_KEY));
  if (env.USAJOBS_API_KEY && env.USAJOBS_EMAIL) providers.push(new UsajobsProvider(env.USAJOBS_API_KEY, env.USAJOBS_EMAIL));
  if (env.CAREERJET_API_KEY) providers.push(new CareerjetProvider(env.CAREERJET_API_KEY));
  return { providers };
}

/** Canned Jobicy responses for end-to-end tests. Fictional companies; links on the test host only. */
function fixtureJobicy(): JobProvider {
  const hoursAgo = (h: number) => new Date(Date.now() - h * 3600_000).toISOString();
  const jobs = [
    {
      id: 91001,
      url: "https://jobs.example.com/jobicy/91001-full-stack-developer",
      jobTitle: "Full Stack Developer",
      companyName: "Harbourview Software",
      jobIndustry: ["Software Engineering"],
      jobType: ["Full-Time"],
      jobGeo: "Canada",
      jobLevel: "Any",
      jobDescription: "<p>Build React and TypeScript interfaces and Node.js REST APIs with PostgreSQL. 1+ years of experience.</p>",
      pubDate: hoursAgo(5),
      salaryMin: 70000,
      salaryMax: 85000,
      salaryCurrency: "CAD",
      salaryPeriod: "yearly",
    },
    {
      id: 91002,
      url: "https://jobs.example.com/jobicy/91002-junior-software-developer",
      jobTitle: "Junior Software Developer",
      companyName: "Northwind Labs",
      jobIndustry: ["Software Engineering"],
      jobType: ["Full-Time"],
      jobGeo: "Canada",
      jobLevel: "Any",
      // The board's own posting, relisted as remote: merged with the board copy, whose link wins.
      jobDescription: JUNIOR_DEV.split("\n").map((l) => (l.startsWith("- ") ? `<li>${l.slice(2)}</li>` : `<p>${l}</p>`)).join(""),
      pubDate: hoursAgo(3),
    },
  ];
  const fake: typeof fetch = async () => new Response(JSON.stringify({ jobs, nextCursor: null, hasMore: false }), { headers: { "content-type": "application/json" } });
  return new JobicyProvider(fake, { allowFixtureHosts: true });
}
