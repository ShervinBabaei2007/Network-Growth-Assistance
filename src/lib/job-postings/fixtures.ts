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

export const JUNIOR_DEV = `Northwind Labs is hiring a Junior Software Developer to join our platform team in Vancouver.

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

/**
 * Canned AI answers for end-to-end tests. Tailoring rewrites each bullet truthfully (it adds
 * the employer's name and job title, both in the resume) and slips in one invented line and
 * skill for the accuracy check to catch. For the Lakeshore Devices posting it returns the
 * resume unchanged, so the "couldn't rewrite meaningfully" path can be tested.
 */
export class FixtureJobsLLM implements LLMProvider {
  readonly enabled = true;
  async structured<S extends z.ZodType>({ system, user, schema }: { system: string; user: string; schema: S }): Promise<LlmResult<z.infer<S>>> {
    let data: unknown = null;
    if (system.startsWith("You tailor a resume") || system.startsWith("You tailor a CV")) {
      const unchanged = user.includes("Lakeshore Devices");
      const entries = [...user.matchAll(/^\[(x\d+|p\d+)\] ([^\n—(]*?)\s*(?:—\s*([^\n(]*?))?\s*(?:\(.*)?$\n((?: {2}\[\w+\] .*\n?)*)/gm)].map((m) => {
        const org = m[2].trim();
        const title = (m[3] ?? "").trim();
        return {
          sourceId: m[1],
          bullets: [...m[4].matchAll(/\[(\w+)\] (.*)/g)].map((b) => ({
            text: unchanged ? b[2].trim() : `${b[2].trim().replace(/[.;]$/, "")} as ${title || "part of the team"} at ${org}`,
            sourceBulletIds: [b[1]],
          })),
        };
      });
      const experience = entries.filter((e) => e.sourceId.startsWith("x"));
      if (experience[0] && !unchanged) experience[0].bullets.push({ text: "Led a Kubernetes migration for 50 services", sourceBulletIds: [experience[0].bullets[0]?.sourceBulletIds[0] ?? "x1b1"] });
      const skills = (user.match(/^SKILLS: (.*)$/m)?.[1] ?? "").split(", ").filter(Boolean);
      const firstJob = user.match(/^\[x\d+\] ([^\n—(]*?)\s*(?:—\s*([^\n(]*?))?\s*(?:\(.*)?$/m);
      data = {
        summary: unchanged || !firstJob ? null : `${(firstJob[2] ?? "Developer").trim()} with hands-on work at ${firstJob[1].trim()}.`,
        skills: unchanged ? skills : [...skills.slice().reverse(), "Kubernetes"],
        experience,
        projects: entries.filter((e) => e.sourceId.startsWith("p")).slice(0, 2),
        sectionOrder: ["experience", "projects", "education"],
      };
    } else if (system.startsWith("You write a cover letter")) {
      const job = user.match(/^JOB POSTING:\n(.*)$/m)?.[1] ?? "this role";
      data = {
        greeting: "Dear Hiring Manager,",
        paragraphs: [`I'm applying for the ${job.split(" at ")[0]} role.`, "I have five years of Kubernetes experience.", "Thank you for considering my application."],
        closing: "Sincerely,",
      };
    } else if (system.startsWith("You read one job posting")) {
      const lines = user.split("\n").map((l) => l.replace(/^[-•]\s*/, "").trim()).filter((l) => l && l.length < 80);
      data = { requiredSkills: [], preferredSkills: [], responsibilities: [], requiredQualifications: [], preferredQualifications: [], keywords: lines.slice(2, 4) };
    } else if (system.startsWith("You advise a job seeker")) {
      const bullet = user.match(/^ {2}\[(x\d+b\d+)\]/m)?.[1] ?? null;
      data = {
        notes: [
          { section: "experience", priority: "medium", target: bullet, recommendation: "If accurate, say what this work let the team do.", why: "The posting asks for work that helps the team." },
          { section: "skills", priority: "high", target: null, recommendation: "Add Kubernetes to your skills.", why: "Teams use it." },
        ],
      };
    }
    if (!data) return { ok: false, reason: "fixture: no canned answer" };
    const parsed = schema.safeParse(data);
    return parsed.success ? { ok: true, data: parsed.data } : { ok: false, reason: "fixture: schema mismatch" };
  }
}
