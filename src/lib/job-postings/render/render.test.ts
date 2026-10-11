import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { renderDocx } = await import("./docx");
const { renderPdf } = await import("./pdf");
const { fileName, letterBlocks, resumeBlocks } = await import("./layout");
const { pdfToText } = await import("../pdf-text");
const { parseResumeHeuristic } = await import("../resume");

import type { CoverLetterDoc, TailoredResumeDoc } from "../documents";

const header = { name: "Sam Lee", email: "sam@example.com", phone: "604-555-0101", location: "Burnaby, BC", links: ["github.com/samlee"] };
const resume: TailoredResumeDoc = {
  header,
  summary: "Developer who builds reliable web apps.",
  skills: ["Python", "Flask", "SQL"],
  sections: [
    {
      key: "experience",
      entries: [
        {
          sourceId: "x1",
          organization: "Acme Corp",
          title: "Software Developer Co-op",
          start: "May 2024",
          end: "Dec 2024",
          location: "Vancouver, BC",
          bullets: [
            { text: "Built REST endpoints in Python and Flask serving 2,000 daily users", sourceBulletIds: ["x1b1"] },
            { text: "Cut test suite runtime by 20% by parallelising pytest", sourceBulletIds: ["x1b2"] },
          ],
        },
      ],
    },
    { key: "education", entries: [{ sourceId: "d1", organization: "BCIT", title: "Diploma, Computer Systems Technology", start: "2023", end: "2025", location: null, bullets: [] }] },
  ],
  certifications: [],
};

describe("rendering", () => {
  it("writes a text PDF that our own resume reader can parse back", async () => {
    const pdf = await renderPdf(resumeBlocks(resume), "Resume", "Sam Lee");
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    const text = await pdfToText(new Uint8Array(pdf));
    expect(text.ok).toBe(true);
    if (!text.ok) return;
    expect(text.text).toContain("Built REST endpoints in Python and Flask serving 2,000 daily users");
    const parsed = parseResumeHeuristic(text.text);
    expect(parsed.name).toBe("Sam Lee");
    expect(parsed.skills).toEqual(["Python", "Flask", "SQL"]);
  });

  it("writes a DOCX (a zip file)", async () => {
    const docx = await renderDocx(resumeBlocks(resume), "Resume");
    expect(docx.subarray(0, 2).toString()).toBe("PK");
    expect(docx.byteLength).toBeGreaterThan(3000);
  });

  it("lays out a cover letter with date, company and signature", () => {
    const letter: CoverLetterDoc = { header, company: "Northwind Labs", jobTitle: "Junior Developer", greeting: "Dear Hiring Manager,", paragraphs: ["One.", "Two."], closing: "Sincerely,", signature: "Sam Lee" };
    const texts = letterBlocks(letter, new Date("2026-10-11T12:00:00Z")).flatMap((b) => ("text" in b ? [b.text] : []));
    expect(texts).toEqual(["Sam Lee", "Burnaby, BC  |  604-555-0101  |  sam@example.com  |  github.com/samlee", "October 11, 2026", "Northwind Labs", "Re: Junior Developer", "Dear Hiring Manager,", "One.", "Two.", "Sincerely,", "Sam Lee"]);
  });

  it("names files after the person, document and company", () => {
    expect(fileName("Sam Lee", "resume", "Northwind Labs, Inc.", "pdf")).toBe("Sam-Lee-Resume-Northwind-Labs-Inc.pdf");
    expect(fileName(null, "cover_letter", null, "docx")).toBe("Cover-Letter.docx");
  });
});
