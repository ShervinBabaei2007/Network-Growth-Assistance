import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { pdfToText } = await import("./pdf-text");
const { parseResumeHeuristic, highestDegree, yearsOfExperience, resumeText } = await import("./resume");
const { fixtureBoard, FIXTURE_EMPLOYERS, FixtureEmbedder } = await import("./fixtures");
const { canadianPlace } = await import("./ats/types");
const { dateJob } = await import("./crawler");
const { isFresh } = await import("./normalize");
const { extractRequirements } = await import("./requirements");
const { indexResume, matchFree, resumeLinesFrom } = await import("./match");
const { scoreFit } = await import("./fit");
const { smartCoverLetter } = await import("./smart-tailor");
const { buildImprovementNotes } = await import("./improvement-notes");
const { analyzeJob } = await import("./job-analysis");

/**
 * The free flow end to end, without a database: the e2e sample resume PDF, the fixture
 * employer boards, the Canada and 24-hour filters, requirements, matching by skills and
 * by (stand-in) meaning, fit rules, Improvement Notes and the template cover letter.
 */
describe("jobs pipeline without AI", async () => {
  const pdf = await pdfToText(new Uint8Array(readFileSync("e2e/fixtures/sample-resume.pdf")));
  if (!pdf.ok) throw new Error(pdf.error);
  const profile = parseResumeHeuristic(pdf.text);
  const text = resumeText(profile, pdf.text);
  const lines = resumeLinesFrom(profile);
  const index = indexResume(lines);
  const applicant = { years: yearsOfExperience(profile, new Date("2026-10-11")), degree: highestDegree(profile), facts: { workAuthorization: "citizen" as const, securityClearance: false, willingToRelocate: false, yearsOverride: null } };
  const embedder = new FixtureEmbedder();
  const lineVectors = await embedder.embed(lines.map((l) => l.text));

  // What a first crawl of every board stores, then what the 24-hour feed shows.
  const boards = await Promise.all(FIXTURE_EMPLOYERS.map(async (e) => ({ e, r: await fixtureBoard.fetchBoard(e.token, {}) })));
  const stored = boards.flatMap(({ e, r }) =>
    r.notModified
      ? []
      : r.jobs.flatMap((job) => {
          const place = canadianPlace(job.places, job.remote);
          return place ? [{ company: e.name, job, place, dated: dateJob(job, true) }] : [];
        }),
  );
  const feed = stored.filter((s) => s.dated.dateSource !== "unknown" && isFresh(s.dated.postedAt));

  async function evaluate(company: string) {
    const s = feed.find((f) => f.company === company)!;
    const reqs = extractRequirements(s.job.description ?? "");
    const reqVectors = await embedder.embed(reqs.map((r) => r.text));
    const hits = new Map(
      reqs.map((r, i) => {
        const sims = lineVectors.map((v) => v.reduce((sum, x, k) => sum + x * reqVectors[i][k], 0));
        const best = sims.indexOf(Math.max(...sims));
        return [r.id, { lineId: lines[best].id, similarity: sims[best] }] as const;
      }),
    );
    const results = matchFree(reqs, index, hits, embedder.thresholds);
    return { s, reqs, results, fit: scoreFit(reqs, results, applicant) };
  }

  it("keeps only Canadian jobs, and only recent dated ones in the feed", () => {
    expect(stored.map((s) => s.job.title)).not.toContain("Software Engineer");
    expect(stored.find((s) => s.job.title === "IT Support Technician")?.dated.dateSource).toBe("unknown");
    expect(feed.map((f) => f.company).sort()).toEqual(["Coastal Health Tech", "Fraser Robotics", "Lakeshore Devices", "Maple Commerce", "Northwind Labs"]);
    expect(feed.find((f) => f.company === "Northwind Labs")?.place).toMatchObject({ province: "BC", city: "Vancouver" });
  });

  it("rates the junior role a match and sets the senior one aside with reasons", async () => {
    const junior = await evaluate("Northwind Labs");
    expect(["strong", "good"]).toContain(junior.fit.tier);
    const senior = await evaluate("Fraser Robotics");
    expect(senior.fit.tier).toBe("excluded");
    expect(senior.fit.exclusionReasons.join(" ")).toMatch(/7 years/);
  });

  it("without AI, gives honest notes and a template letter, never adding the missing skills", async () => {
    const { s, reqs, results } = await evaluate("Fraser Robotics");
    const posting = { title: s.job.title, company: s.company, description: s.job.description ?? "" };
    const before = JSON.stringify(profile);
    const notes = buildImprovementNotes({ profile, analysis: analyzeJob(posting, reqs), requirements: reqs, results, applicant, posting });
    // What the person lacks is listed as not found, with a warning not to add it.
    expect(notes.comparison.notFound.map((k) => k.term)).toEqual(expect.arrayContaining(["C++", "RTOS"]));
    expect(notes.comparison.notFound.every((k) => /Do not add it unless you genuinely have that experience/.test(k.message))).toBe(true);
    expect(notes.notes.filter((n) => /\b(add|move)\b/i.test(n.recommendation) && /C\+\+|RTOS|P\.Eng/.test(n.recommendation) && !/Don't claim/.test(n.recommendation))).toEqual([]);
    expect(JSON.stringify(profile)).toBe(before);

    const input = { profile, resumeText: text, years: applicant.years, posting, requirements: reqs, results, relevance: new Map<string, number>(), mode: "apply_anyway" as const };
    const letter = smartCoverLetter(input);
    expect(letter.issues).toEqual([]);
    const gap = letter.doc.paragraphs.filter((p) => /C\+\+|RTOS/.test(p));
    expect(gap).toEqual(["I haven't yet worked with C++, RTOS and FreeRTOS professionally, and I'm keen to learn quickly on the job."]);
  });
});
