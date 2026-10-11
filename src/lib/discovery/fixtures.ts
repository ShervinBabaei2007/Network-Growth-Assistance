import type { z } from "zod";
import { htmlToText, type FetchedPage, type PageFetcher } from "./fetch-page";
import type { Extraction } from "./extract";
import type { LLMProvider, LlmResult } from "./llm";
import type { OrcidProfile, SearchProvider, SearchResult } from "./providers/types";

/**
 * A small, fictional public web used by unit and end-to-end tests
 * (DISCOVERY_FIXTURES=1). No network, no API keys. All people here are invented.
 */

const page = (title: string, body: string, links: string[] = []) =>
  `<html><head><title>${title}</title></head><body>${body}${links.map((l) => `<a href="${l}">${l}</a>`).join(" ")}</body></html>`;

export const FIXTURE_PAGES: Record<string, string> = {
  "https://alexchen.example.dev/": page(
    "Alex Chen — Backend Engineer",
    `<h1>Alex Chen</h1><p>I'm a backend engineer at AMD in Toronto, working on GPU driver tooling.</p>
     <p>I graduated from the University of Toronto with a BASc in Computer Engineering in 2023.</p>`,
    ["https://github.com/alexchen-dev", "https://www.linkedin.com/in/alex-chen-fixture"],
  ),
  "https://robotics.example.org/team": page(
    "UofT Robotics Association — Team",
    `<h1>Our 2025 team</h1><p>University of Toronto Robotics Association</p>
     <ul><li>Priya Raman — Software Lead, Computer Engineering, University of Toronto</li>
     <li>Jordan Lee — Electrical and Computer Engineering, University of Toronto. Now a Software Developer at Shopify.</li>
     <li>Chris Park — Mechanical Engineering</li></ul>`,
  ),
  "https://sampatel.example.io/about": page(
    "About Sam Patel",
    `<p>Sam Patel is a software engineer at NVIDIA. Sam studied Computer Engineering at the University of Toronto (class of 2021).</p>`,
  ),
  "https://mariagomez.example.ca/": page(
    "Maria Gomez",
    `<p>Maria Gomez — Computer Engineering at Toronto Metropolitan University. Software engineer at Microsoft.</p>`,
  ),
  "https://apple-team.example.com/wei-zhang": page(
    "Wei Zhang | Engineering Team",
    `<p>Wei Zhang is a software engineer at Apple in Vancouver. Wei studied Computer Engineering at the University of Toronto.</p>`,
  ),
};

const WEB_RESULTS: Omit<SearchResult, "rank" | "provider">[] = [
  { url: "https://alexchen.example.dev/", title: "Alex Chen — Backend Engineer", snippet: "University of Toronto Computer Engineering graduate, backend engineer at AMD." },
  { url: "https://robotics.example.org/team", title: "UofT Robotics Association — Team", snippet: "University of Toronto Robotics Association members, Computer Engineering." },
  { url: "https://sampatel.example.io/about", title: "About Sam Patel", snippet: "Computer Engineering at the University of Toronto, software engineer at NVIDIA." },
  { url: "https://mariagomez.example.ca/", title: "Maria Gomez", snippet: "Computer Engineering, Toronto." },
  { url: "https://apple-team.example.com/wei-zhang", title: "Wei Zhang | Engineering Team", snippet: "Computer Engineering at the University of Toronto." },
  // LinkedIn results may appear in search results; they're never fetched.
  { url: "https://www.linkedin.com/in/someone-fixture", title: "Someone — LinkedIn", snippet: "University of Toronto" },
];

export const FIXTURE_EXTRACTIONS: Record<string, Extraction> = {
  "https://alexchen.example.dev/": {
    people: [
      {
        fullName: "Alex Chen",
        headline: null,
        facts: [
          { field: "role", value: "backend engineer", quote: "I'm a backend engineer at AMD in Toronto" },
          { field: "company", value: "AMD", quote: "I'm a backend engineer at AMD in Toronto" },
          { field: "location", value: "Toronto", quote: "I'm a backend engineer at AMD in Toronto" },
          { field: "institution", value: "University of Toronto", quote: "I graduated from the University of Toronto with a BASc in Computer Engineering in 2023." },
          { field: "program", value: "Computer Engineering", quote: "I graduated from the University of Toronto with a BASc in Computer Engineering in 2023." },
          { field: "grad_year", value: "2023", quote: "BASc in Computer Engineering in 2023" },
          // A fabricated fact: the quote is not on the page, so verification must drop it.
          { field: "company", value: "Google", quote: "Previously interned at Google" },
        ],
        githubUrl: "https://github.com/alexchen-dev",
        websiteUrl: null,
        linkedinUrl: "https://www.linkedin.com/in/alex-chen-fixture",
      },
    ],
  },
  "https://robotics.example.org/team": {
    people: [
      {
        fullName: "Priya Raman",
        headline: null,
        facts: [
          { field: "role", value: "Software Lead", quote: "Priya Raman — Software Lead, Computer Engineering, University of Toronto" },
          { field: "program", value: "Computer Engineering", quote: "Priya Raman — Software Lead, Computer Engineering, University of Toronto" },
          { field: "institution", value: "University of Toronto", quote: "Priya Raman — Software Lead, Computer Engineering, University of Toronto" },
        ],
        githubUrl: null,
        websiteUrl: null,
        // Invented link: not on the page, so it must be dropped.
        linkedinUrl: "https://www.linkedin.com/in/priya-raman-made-up",
      },
      {
        fullName: "Jordan Lee",
        headline: null,
        facts: [
          { field: "program", value: "Electrical and Computer Engineering", quote: "Jordan Lee — Electrical and Computer Engineering, University of Toronto." },
          { field: "institution", value: "University of Toronto", quote: "Jordan Lee — Electrical and Computer Engineering, University of Toronto." },
          { field: "role", value: "Software Developer", quote: "Now a Software Developer at Shopify." },
          { field: "company", value: "Shopify", quote: "Now a Software Developer at Shopify." },
        ],
        githubUrl: null,
        websiteUrl: null,
        linkedinUrl: null,
      },
    ],
  },
  "https://sampatel.example.io/about": {
    people: [
      {
        fullName: "Sam Patel",
        headline: null,
        facts: [
          { field: "role", value: "software engineer", quote: "Sam Patel is a software engineer at NVIDIA." },
          { field: "company", value: "NVIDIA", quote: "Sam Patel is a software engineer at NVIDIA." },
          { field: "institution", value: "University of Toronto", quote: "Sam studied Computer Engineering at the University of Toronto (class of 2021)." },
          { field: "program", value: "Computer Engineering", quote: "Sam studied Computer Engineering at the University of Toronto (class of 2021)." },
          { field: "grad_year", value: "2021", quote: "(class of 2021)" },
        ],
        githubUrl: null,
        websiteUrl: null,
        linkedinUrl: null,
      },
    ],
  },
  "https://mariagomez.example.ca/": {
    people: [
      {
        fullName: "Maria Gomez",
        headline: null,
        facts: [
          { field: "institution", value: "Toronto Metropolitan University", quote: "Maria Gomez — Computer Engineering at Toronto Metropolitan University." },
          { field: "program", value: "Computer Engineering", quote: "Maria Gomez — Computer Engineering at Toronto Metropolitan University." },
          { field: "company", value: "Microsoft", quote: "Software engineer at Microsoft." },
        ],
        githubUrl: null,
        websiteUrl: null,
        linkedinUrl: null,
      },
    ],
  },
  "https://apple-team.example.com/wei-zhang": {
    people: [
      {
        fullName: "Wei Zhang",
        headline: null,
        facts: [
          { field: "role", value: "software engineer", quote: "Wei Zhang is a software engineer at Apple in Vancouver." },
          { field: "company", value: "Apple", quote: "Wei Zhang is a software engineer at Apple in Vancouver." },
          { field: "location", value: "Vancouver", quote: "Wei Zhang is a software engineer at Apple in Vancouver." },
          { field: "institution", value: "University of Toronto", quote: "Wei studied Computer Engineering at the University of Toronto." },
          { field: "program", value: "Computer Engineering", quote: "Wei studied Computer Engineering at the University of Toronto." },
        ],
        githubUrl: null,
        websiteUrl: null,
        linkedinUrl: null,
      },
    ],
  },
};

export class FixtureWebProvider implements SearchProvider {
  readonly id = "web" as const;
  readonly name = "Fixture web";
  calls: string[] = [];
  async search(query: string): Promise<SearchResult[]> {
    this.calls.push(query);
    return WEB_RESULTS.map((r, i) => ({ ...r, provider: "fixture", rank: i + 1 }));
  }
}

export const FIXTURE_ORCID: OrcidProfile[] = [
  {
    orcidId: "0009-0000-0000-0001",
    name: "Nadia Rahman",
    biography: null,
    urls: ["https://nadia.example.dev"],
    countries: [],
    educations: [{ organization: "University of Toronto", city: "Toronto", country: "CA", department: "Electrical & Computer Engineering", role: "BASc, Computer Engineering", startYear: 2018, endYear: 2022 }],
    employments: [{ organization: "Microsoft", city: "Vancouver", country: "CA", department: null, role: "Software Engineer", startYear: 2022, endYear: null }],
    htmlUrl: "https://orcid.org/0009-0000-0000-0001",
  },
  {
    // Works at the school but didn't study there: must not count as an alumnus.
    orcidId: "0009-0000-0000-0002",
    name: "Omar Haddad",
    biography: "Professor of Computer Engineering.",
    urls: [],
    countries: ["CA"],
    educations: [{ organization: "McGill University", city: "Montreal", country: "CA", department: "Electrical Engineering", role: "PhD", startYear: 2000, endYear: 2005 }],
    employments: [{ organization: "University of Toronto", city: "Toronto", country: "CA", department: "Electrical & Computer Engineering", role: "Professor", startYear: 2010, endYear: null }],
    htmlUrl: "https://orcid.org/0009-0000-0000-0002",
  },
];

export class FixtureOrcidProvider implements SearchProvider {
  readonly id = "orcid" as const;
  readonly name = "Fixture ORCID";
  async search(): Promise<SearchResult[]> {
    return FIXTURE_ORCID.map((p, i) => ({ provider: "orcid", url: p.htmlUrl, title: `${p.name} · ORCID`, snippet: "", rank: i + 1, orcid: p }));
  }
}

export const FIXTURE_READMES: Record<string, string> = {
  "alexchen-dev": `# Hi, I'm Alex Chen 👋

- 💼 Backend Engineer at AMD, working on GPU driver tooling
- 🎓 University of Toronto, Computer Engineering 2T3
- [![LinkedIn](https://img.shields.io/badge/LinkedIn-blue)](https://www.linkedin.com/in/alex-chen-fixture)
`,
};

export const FIXTURE_SOCIAL: Record<string, string[]> = {
  "taylor-kim-fixture": ["https://www.linkedin.com/in/taylor-kim-fixture", "https://twitter.com/taylor"],
};

export class FixtureGitHubProvider implements SearchProvider {
  readonly id = "github" as const;
  readonly name = "Fixture GitHub";
  async socialLinks(login: string): Promise<string[]> {
    return FIXTURE_SOCIAL[login] ?? [];
  }
  async profileReadme(login: string): Promise<string | null> {
    return FIXTURE_READMES[login] ?? null;
  }
  async search(): Promise<SearchResult[]> {
    return [
      {
        provider: "github",
        url: "https://github.com/taylor-kim-fixture",
        title: "Taylor Kim (taylor-kim-fixture)",
        snippet: "UofT CompEng '24 | SWE intern @ Amazon · Vancouver, BC",
        rank: 1,
        structured: {
          login: "taylor-kim-fixture",
          name: "Taylor Kim",
          bio: "UofT CompEng '24 | Software engineer @ Amazon",
          company: null,
          location: "Vancouver, BC",
          blog: null,
          htmlUrl: "https://github.com/taylor-kim-fixture",
        },
      },
      {
        // A strong match on everything except location: lives in the United States, so excluded.
        provider: "github",
        url: "https://github.com/sam-lee-fixture",
        title: "Sam Lee (sam-lee-fixture)",
        snippet: "UofT Computer Engineering 2T2 · Software Engineer @ Amazon · Seattle, WA",
        rank: 2,
        structured: {
          login: "sam-lee-fixture",
          name: "Sam Lee",
          bio: "UofT Computer Engineering 2T2 · Software Engineer @ Amazon",
          company: null,
          location: "Seattle, WA",
          blog: null,
          htmlUrl: "https://github.com/sam-lee-fixture",
        },
      },
    ];
  }
}

export class FixturePageFetcher implements PageFetcher {
  fetched: string[] = [];
  async fetch(url: string): Promise<FetchedPage> {
    this.fetched.push(url);
    const html = FIXTURE_PAGES[url];
    if (!html) return { ok: false, url, reason: "HTTP 404" };
    return { ok: true, url, ...htmlToText(html, url) };
  }
}

/** Returns canned extractions for fixture pages and declines everything else (parse, rerank). */
export class FixtureLLM implements LLMProvider {
  readonly enabled = true;
  calls = 0;
  async structured<S extends z.ZodType>({ user, schema }: { user: string; schema: S }): Promise<LlmResult<z.infer<S>>> {
    this.calls++;
    const url = user.match(/^Source URL: (\S+)/m)?.[1];
    const data = url ? FIXTURE_EXTRACTIONS[url] : undefined;
    if (!data) return { ok: false, reason: "fixture: no canned answer" };
    const parsed = schema.safeParse(data);
    return parsed.success ? { ok: true, data: parsed.data } : { ok: false, reason: "fixture: schema mismatch" };
  }
}
