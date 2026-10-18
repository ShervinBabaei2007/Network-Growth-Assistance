import { z } from "zod";
import { classifyCandidate, type Confidence } from "@/lib/classify";
import type { Catalog, DegreeLevel, Discipline, University } from "@/lib/domain";
import { normalizeProfileUrl } from "@/lib/linkedin/normalize-url";
import { parseCsv } from "./csv";

import { CANDIDATE_FIELDS, type CandidateField } from "./candidate-fields";

export { CANDIDATE_FIELDS };
export type { CandidateField };
export type ColumnMapping = Partial<Record<CandidateField, number>>;

const HEADER_ALIASES: Record<CandidateField, string[]> = {
  fullName: ["name", "full name", "fullname", "candidate", "person"],
  profileUrl: ["linkedin url", "linkedin", "profile url", "url", "profile", "linkedin profile"],
  school: ["school", "university", "institution", "college", "campus"],
  program: ["program", "major", "discipline", "degree program", "field of study", "programme"],
  role: ["role", "headline", "title", "position", "current role"],
  degreeLevel: ["degree level", "degree", "level"],
  gradYear: ["graduation year", "grad year", "class of", "graduation", "year"],
  notes: ["notes", "note", "comments", "context"],
};

/** Guesses which column holds each field from the header names. */
export function detectMapping(headers: string[]): ColumnMapping {
  const mapping: ColumnMapping = {};
  const used = new Set<number>();
  const norm = headers.map((h) => h.trim().toLowerCase().replace(/[_-]+/g, " "));
  for (const field of Object.keys(HEADER_ALIASES) as CandidateField[]) {
    for (const alias of HEADER_ALIASES[field]) {
      const i = norm.findIndex((h, idx) => !used.has(idx) && h === alias);
      if (i !== -1) {
        mapping[field] = i;
        used.add(i);
        break;
      }
    }
  }
  return mapping;
}

export function parseDegreeLevel(text: string): DegreeLevel | null {
  const t = text.trim().toLowerCase();
  if (!t) return null;
  if (/(^|\b)(phd|ph\.d|doctor|doctoral)/.test(t)) return "doctoral";
  if (/(master|msc|m\.sc|meng|m\.eng|masc|m\.a\.sc|mba)/.test(t)) return "masters";
  if (/(alum|graduate[d]?$)/.test(t)) return "alumni";
  if (/(undergrad|bachelor|basc|bsc|b\.sc|beng|b\.eng|bcs|student)/.test(t)) return "undergraduate";
  return "other";
}

export type CandidateDraft = {
  full_name: string;
  profile_url: string;
  profile_key: string;
  raw_school_text: string | null;
  raw_program_text: string | null;
  role: string | null;
  degree_level: DegreeLevel | null;
  grad_year: number | null;
  notes: string | null;
  university: University | null;
  discipline: Discipline | null;
  university_confidence: Confidence;
  discipline_confidence: Confidence;
  classificationNote: string;
};

export type RowIssue = { line: number; reason: string };

const MAX_ROWS = 5000;
const text = (max: number) => z.string().trim().max(max).transform((v) => v || null);

/**
 * Validates and classifies CSV rows. Rows are never guessed into a category:
 * anything unclear keeps `needs_review`. Duplicates inside the file are dropped.
 */
export function prepareCandidateRows(
  csvText: string,
  mapping: ColumnMapping,
  opts: { catalog: Catalog; hasHeader: boolean },
): { drafts: CandidateDraft[]; issues: RowIssue[]; totalRows: number } {
  const rows = parseCsv(csvText);
  const body = opts.hasHeader ? rows.slice(1) : rows;
  const firstLine = opts.hasHeader ? 2 : 1;
  const drafts: CandidateDraft[] = [];
  const issues: RowIssue[] = [];
  const seen = new Set<string>();

  if (mapping.fullName === undefined || mapping.profileUrl === undefined) {
    return { drafts, issues: [{ line: 0, reason: "Choose the Name and LinkedIn URL columns." }], totalRows: body.length };
  }
  if (body.length > MAX_ROWS) {
    return { drafts, issues: [{ line: 0, reason: `Import at most ${MAX_ROWS.toLocaleString("en-CA")} rows at a time.` }], totalRows: body.length };
  }

  body.forEach((row, i) => {
    const line = firstLine + i;
    const cell = (f: CandidateField) => (mapping[f] === undefined ? "" : (row[mapping[f]!] ?? ""));

    const name = cell("fullName").trim();
    if (!name) return issues.push({ line, reason: "Missing name." });
    if (name.length > 200) return issues.push({ line, reason: "Name is too long." });

    const url = normalizeProfileUrl(cell("profileUrl"));
    if (!url.ok) return issues.push({ line, reason: url.reason });
    if (seen.has(url.key)) return issues.push({ line, reason: "Same profile appears earlier in this file." });
    seen.add(url.key);

    const yearText = cell("gradYear").trim();
    let grad_year: number | null = null;
    if (yearText) {
      const m = yearText.match(/\b(19[5-9]\d|20\d\d|2100)\b/);
      if (!m) return issues.push({ line, reason: `Graduation year “${yearText}” isn't a year.` });
      grad_year = Number(m[1]);
    }

    const school = text(300).parse(cell("school"));
    const program = text(300).parse(cell("program"));
    const c = classifyCandidate(school, program, opts.catalog);

    drafts.push({
      full_name: name,
      profile_url: url.url,
      profile_key: url.key,
      raw_school_text: school,
      raw_program_text: program,
      role: text(300).parse(cell("role")),
      degree_level: parseDegreeLevel(cell("degreeLevel")),
      grad_year,
      notes: text(2000).parse(cell("notes")),
      university: c.university.value,
      discipline: c.discipline.value,
      university_confidence: c.university.confidence,
      discipline_confidence: c.discipline.confidence,
      classificationNote:
        c.university.confidence === "confirmed" && c.discipline.confidence === "confirmed"
          ? "Confirmed"
          : [c.university, c.discipline].filter((x) => x.confidence !== "confirmed").map((x) => x.reason).join(" "),
    });
  });

  return { drafts, issues, totalRows: body.length };
}
