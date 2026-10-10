import { describe, expect, it } from "vitest";
import { detectMapping, parseDegreeLevel, prepareCandidateRows } from "./candidates-csv";
import { findHeaderRow, parseCsv } from "./csv";

describe("parseCsv", () => {
  it("handles quotes, escaped quotes, embedded commas and newlines", () => {
    const text = '﻿Name,Notes\r\n"Doe, Jane","Said ""hi""\nat the fair"\r\nBob,\n\n';
    expect(parseCsv(text)).toEqual([
      ["Name", "Notes"],
      ["Doe, Jane", 'Said "hi"\nat the fair'],
      ["Bob", ""],
    ]);
  });

  it("keeps a final row without a trailing newline", () => {
    expect(parseCsv("a,b\nc,d")).toEqual([
      ["a", "b"],
      ["c", "d"],
    ]);
  });

  it("finds a header row after preamble lines", () => {
    const rows = parseCsv("Notes:\nSome text here\n\nFirst Name,Last Name,URL\nA,B,C");
    expect(findHeaderRow(rows, ["First Name", "URL"])).toBe(2);
  });
});

describe("detectMapping", () => {
  it("matches common header names", () => {
    expect(detectMapping(["Full Name", "LinkedIn URL", "University", "Major", "Headline", "Grad Year", "Notes"])).toEqual({
      fullName: 0,
      profileUrl: 1,
      school: 2,
      program: 3,
      role: 4,
      gradYear: 5,
      notes: 6,
    });
  });
});

describe("parseDegreeLevel", () => {
  it.each([
    ["BASc", "undergraduate"],
    ["MEng", "masters"],
    ["PhD candidate", "doctoral"],
    ["Alumni", "alumni"],
    ["", null],
  ])("%s → %s", (input, expected) => {
    expect(parseDegreeLevel(input)).toBe(expected);
  });
});

describe("prepareCandidateRows", () => {
  const csv = [
    "Name,URL,School,Program,Grad year",
    "Ada Lovelace,https://www.linkedin.com/in/ada/,UBC,Computer Engineering,2027",
    "Alan Turing,linkedin.com/in/alan-t,University of Toronto,ECE,Class of 2026",
    "Duplicate Ada,https://ca.linkedin.com/in/ADA,UBC,Computer Engineering,",
    ",https://www.linkedin.com/in/noname,UBC,CS,",
    "Grace Hopper,https://example.com/grace,SFU,CMPT,",
    "Bad Year,https://www.linkedin.com/in/bad-year,SFU,CMPT,soon",
  ].join("\n");
  const mapping = { fullName: 0, profileUrl: 1, school: 2, program: 3, gradYear: 4 };

  it("validates, classifies and dedupes rows", () => {
    const r = prepareCandidateRows(csv, mapping, { countUbcoAsUbc: true, hasHeader: true });
    expect(r.totalRows).toBe(6);
    expect(r.drafts.map((d) => d.profile_key)).toEqual(["ada", "alan-t"]);
    expect(r.drafts[0]).toMatchObject({
      university: "ubc",
      discipline: "ce",
      university_confidence: "confirmed",
      discipline_confidence: "confirmed",
      grad_year: 2027,
    });
    expect(r.drafts[1]).toMatchObject({
      university: "uoft",
      discipline: null,
      discipline_confidence: "needs_review",
      grad_year: 2026,
    });
    expect(r.issues).toEqual([
      { line: 4, reason: "Same profile appears earlier in this file." },
      { line: 5, reason: "Missing name." },
      { line: 6, reason: "Only linkedin.com profile links are supported." },
      { line: 7, reason: "Graduation year “soon” isn't a year." },
    ]);
  });

  it("requires the name and URL columns", () => {
    const r = prepareCandidateRows(csv, { fullName: 0 }, { countUbcoAsUbc: true, hasHeader: true });
    expect(r.drafts).toEqual([]);
    expect(r.issues[0].reason).toContain("LinkedIn URL");
  });
});
