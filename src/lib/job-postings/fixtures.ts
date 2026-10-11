import type { z } from "zod";
import type { LLMProvider, LlmResult } from "@/lib/discovery/llm";
import { clean } from "@/lib/text/match";
import type { AtsAdapter, AtsJob } from "./ats/types";
import type { Embedder } from "./embeddings";

/**
 * Fictional employer boards, a stand-in embedder and canned AI answers for end-to-end
 * tests and local demos (JOBS_FIXTURES=1). No network calls; the companies don't exist.
 */

export const FIXTURE_EMPLOYERS = [
  { name: "Northwind Labs", token: "northwind-labs" },
  { name: "Fraser Robotics", token: "fraser-robotics" },
  { name: "Coastal Health Tech", token: "coastal-health" },
  { name: "Maple Commerce", token: "maple-commerce" },
  { name: "Lakeshore Devices", token: "lakeshore-devices" },
] as const;

const hoursAgo = (h: number) => new Date(Date.now() - h * 3600_000).toISOString();

const job = (token: string, slug: string, title: string, place: string, hours: number | null, description: string): AtsJob => ({
  externalId: slug,
  title,
  company: null,
  places: [{ text: place }],
  remote: false,
  postedAt: hours === null ? null : hoursAgo(hours),
  precision: "time",
  applyUrl: `https://jobs.example.com/${token}/${slug}`,
  description,
  salary: null,
  employmentType: "Full-time",
  department: "Engineering",
});

const JUNIOR_DEV = `Northwind Labs is hiring a Junior Software Developer to join our platform team in Vancouver.

What you'll do
- Build and maintain REST APIs in Python
- Write SQL against PostgreSQL
- Review code and write unit tests

Requirements
- 1+ years of experience building software (co-op counts)
- Diploma or degree in Computer Science, Computer Systems Technology or similar
- Python and SQL
- Git

Nice to have
- React
- Docker`;

const SENIOR_EMBEDDED = `Fraser Robotics designs motion controllers for industrial robots.

Requirements
- 7+ years of embedded software experience
- Must hold a P.Eng licence in British Columbia
- Expert C++ and RTOS (FreeRTOS or Zephyr)
- Bachelor's degree in Electrical or Computer Engineering

Nice to have
- ROS2`;

const QA = `Coastal Health Tech is looking for a QA Automation Analyst.

Requirements
- 2+ years in software QA
- Selenium or Playwright test automation
- Python
- Jira

Nice to have
- CI/CD with GitHub Actions`;

const FULL_STACK = `Maple Commerce builds checkout software for Canadian retailers.

Requirements
- 2+ years of professional experience
- TypeScript, React and Node.js
- PostgreSQL
- Must be legally eligible to work in Canada

Nice to have
- Docker
- AWS`;

const FIRMWARE = `Lakeshore Devices makes sensors for smart buildings.

Requirements
- Currently enrolled in or recently graduated from a diploma or degree program
- C programming for microcontrollers
- I2C and SPI
- Python scripting

Nice to have
- Oscilloscope experience`;

const BOARDS: Record<string, () => AtsJob[]> = {
  "northwind-labs": () => [
    job("northwind-labs", "jr-dev", "Junior Software Developer", "Vancouver, BC", 2, JUNIOR_DEV),
    // Too old: left out of the 24-hour feed.
    job("northwind-labs", "analyst", "Data Analyst", "Surrey, BC", 30, "Requirements\n- SQL\n- Excel"),
  ],
  "fraser-robotics": () => [
    job("fraser-robotics", "senior-embedded", "Senior Embedded Software Engineer", "Burnaby, BC", 5, SENIOR_EMBEDDED),
    // Outside Canada: never stored.
    job("fraser-robotics", "seattle", "Software Engineer", "Seattle, WA", 4, "Requirements\n- Go\n- Kubernetes"),
  ],
  "coastal-health": () => [
    job("coastal-health", "qa", "QA Automation Analyst", "Victoria, BC", 10, QA),
    // No date on the board: only counts once the crawler has seen this board before.
    job("coastal-health", "it-support", "IT Support Technician", "Richmond, BC", null, "Requirements\n- Help desk experience"),
  ],
  "maple-commerce": () => [job("maple-commerce", "full-stack", "Full Stack Developer", "Toronto, ON", 3, FULL_STACK)],
  "lakeshore-devices": () => [job("lakeshore-devices", "firmware-coop", "Firmware Developer Co-op", "Waterloo, ON", 8, FIRMWARE)],
};

export const fixtureBoard: AtsAdapter = {
  kind: "fixture",
  label: "Sample board",
  boardUrl: (t) => `https://jobs.example.com/${t}`,
  async fetchBoard(token) {
    return { notModified: false, etag: null, jobs: BOARDS[token]?.() ?? [] };
  },
};

/**
 * A deterministic stand-in for the embedding model: hashed word counts, normalized.
 * Lines sharing words score high, unrelated lines score near zero.
 */
export class FixtureEmbedder implements Embedder {
  readonly enabled = true;
  // Word-overlap vectors score lower than a real model.
  readonly thresholds = { met: 0.6, partial: 0.4 };
  async embed(texts: string[]): Promise<number[][]> {
    return texts.map((t) => {
      const v = new Array<number>(384).fill(0);
      for (const w of clean(t).trim().split(" ").filter((x) => x.length > 2)) {
        let h = 2166136261;
        for (const ch of w) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
        v[Math.abs(h) % 384] += 1;
      }
      const norm = Math.hypot(...v) || 1;
      return v.map((x) => x / norm);
    });
  }
}

/** Canned AI tailoring: faithful rewrites plus one invented line, so the accuracy check has something to catch. */
export class FixtureJobsLLM implements LLMProvider {
  readonly enabled = true;
  async structured<S extends z.ZodType>({ system, user, schema }: { system: string; user: string; schema: S }): Promise<LlmResult<z.infer<S>>> {
    let data: unknown = null;
    if (system.startsWith("You tailor a resume")) {
      const entries = [...user.matchAll(/^\[(x\d+|p\d+)\] .*$\n((?: {2}\[\w+\] .*\n?)*)/gm)].map((m) => ({
        sourceId: m[1],
        bullets: [...m[2].matchAll(/\[(\w+)\] (.*)/g)].map((b) => ({ text: b[2].trim(), sourceBulletIds: [b[1]] })),
      }));
      const experience = entries.filter((e) => e.sourceId.startsWith("x"));
      if (experience[0]) experience[0].bullets.push({ text: "Led a Kubernetes migration for 50 services", sourceBulletIds: [experience[0].bullets[0]?.sourceBulletIds[0] ?? "x1b1"] });
      const skills = (user.match(/^SKILLS: (.*)$/m)?.[1] ?? "").split(", ").filter(Boolean);
      data = { summary: null, skills: [...skills, "Kubernetes"], experience, projects: entries.filter((e) => e.sourceId.startsWith("p")).slice(0, 2), sectionOrder: ["experience", "projects", "education"] };
    } else if (system.startsWith("You write a cover letter")) {
      const job = user.match(/^JOB POSTING:\n(.*)$/m)?.[1] ?? "this role";
      data = {
        greeting: "Dear Hiring Manager,",
        paragraphs: [`I'm applying for the ${job.split(" at ")[0]} role.`, "I have five years of Kubernetes experience.", "Thank you for considering my application."],
        closing: "Sincerely,",
      };
    }
    if (!data) return { ok: false, reason: "fixture: no canned answer" };
    const parsed = schema.safeParse(data);
    return parsed.success ? { ok: true, data: parsed.data } : { ok: false, reason: "fixture: schema mismatch" };
  }
}
