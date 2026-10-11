import { describe, expect, it } from "vitest";
import { guessMapping, parseConnections, planConnectionImport, type ExistingConnection } from "./csv";
import { CsvConnectionSource, ManualConnectionSource } from "./source";

const LINKEDIN = `﻿Notes:
"When exporting your connection data, you may notice that some of the email addresses are missing."

First Name,Last Name,URL,Email Address,Company,Position,Connected On
Alex,Chen,https://www.linkedin.com/in/alex-chen-1,alex@example.com,AMD,Software Engineer,09 Oct 2026
Priya,Patel,https://www.linkedin.com/in/priya-p,,Microsoft,"Engineer, Azure",1 Jan 2025
Hidden,Member,,,,,
Alex,Chen,https://ca.linkedin.com/in/Alex-Chen-1/?trk=x,,AMD,Software Engineer,09 Oct 2026
,,,,,,
`;

describe("parseConnections", () => {
  it("reads LinkedIn's Connections.csv after the Notes preamble", () => {
    const p = parseConnections(LINKEDIN);
    expect(p.error).toBeUndefined();
    expect(p.isLinkedInExport).toBe(true);
    expect(p.rows).toHaveLength(3);
    expect(p.duplicatesInFile).toBe(1);
    expect(p.rows[0]).toMatchObject({
      fullName: "Alex Chen",
      normalizedName: "alex chen",
      company: "AMD",
      position: "Software Engineer",
      linkedinKey: "alex-chen-1",
      connectedOn: "2026-10-09",
    });
    expect(p.rows[1].position).toBe("Engineer, Azure");
    // A member without a URL is still a known connection, matched by name + company.
    expect(p.rows[2]).toMatchObject({ fullName: "Hidden Member", linkedinKey: null });
  });

  it("never returns or previews email addresses", () => {
    const p = parseConnections(LINKEDIN);
    expect(JSON.stringify(p.rows)).not.toContain("alex@example.com");
    expect(JSON.stringify(p.sample)).not.toContain("alex@example.com");
  });

  it("maps a generic contact list by header names", () => {
    const p = parseConnections("Name,Organization,Title,Email\nDr. Sam Lee,NVIDIA,GPU Architect,s@x.com\n");
    expect(p.isLinkedInExport).toBe(false);
    expect(p.rows[0]).toMatchObject({ fullName: "Dr. Sam Lee", normalizedName: "sam lee", firstName: "Dr.", company: "NVIDIA", position: "GPU Architect" });
  });

  it("accepts a manual column mapping", () => {
    const p = parseConnections("Who,Where\nJane Doe,Shopify\n", { fullName: 0, company: 1 });
    expect(p.rows[0]).toMatchObject({ fullName: "Jane Doe", company: "Shopify" });
  });

  it("explains when there is no name column", () => {
    expect(parseConnections("a,b\n1,2\n").error).toMatch(/name column/);
  });

  it("guesses the mapping case-insensitively", () => {
    expect(guessMapping(["FIRST NAME", "Last Name", "url"])).toMatchObject({ firstName: 0, lastName: 1, linkedinUrl: 2, company: -1 });
  });
});

describe("planConnectionImport", () => {
  const existing: ExistingConnection[] = [
    { id: "e1", linkedinKey: "alex-chen-1", normalizedName: "alex chen", company: "AMD", position: "Software Engineer", connectedOn: "2026-10-09" },
    { id: "e2", linkedinKey: null, normalizedName: "priya patel", company: "Microsoft", position: null, connectedOn: null },
  ];

  it("skips exact duplicates and fills in new details on re-import", () => {
    const plan = planConnectionImport(parseConnections(LINKEDIN).rows, existing);
    expect(plan.unchanged).toBe(1);
    expect(plan.update).toEqual([
      { id: "e2", changes: { linkedinKey: "priya-p", linkedinUrl: "https://www.linkedin.com/in/priya-p", position: "Engineer, Azure", connectedOn: "2025-01-01" } },
    ]);
    expect(plan.insert.map((r) => r.fullName)).toEqual(["Hidden Member"]);
  });

  it("importing the same file twice changes nothing the second time", () => {
    const rows = parseConnections(LINKEDIN).rows;
    const first = planConnectionImport(rows, []);
    const stored: ExistingConnection[] = first.insert.map((r, i) => ({ id: `n${i}`, ...r }));
    const second = planConnectionImport(rows, stored);
    expect(second.insert).toHaveLength(0);
    expect(second.update).toHaveLength(0);
    expect(second.unchanged).toBe(rows.length);
  });

  it("keeps two people with the same name at different companies apart", () => {
    const rows = parseConnections("Name,Company\nJohn Smith,Amazon\nJohn Smith,Microsoft\n").rows;
    expect(rows).toHaveLength(2);
    const plan = planConnectionImport(rows, [{ id: "x", linkedinKey: null, normalizedName: "john smith", company: "Amazon", position: null, connectedOn: null }]);
    expect(plan.insert.map((r) => r.company)).toEqual(["Microsoft"]);
  });

  it("treats a different LinkedIn slug as a different person", () => {
    const rows = parseConnections("First Name,Last Name,URL,Company\nAlex,Chen,https://linkedin.com/in/other-alex,AMD\n").rows;
    expect(planConnectionImport(rows, existing).insert).toHaveLength(1);
  });
});

describe("connection sources", () => {
  it("CsvConnectionSource reports the kind and rows", async () => {
    const src = new CsvConnectionSource(LINKEDIN);
    expect(src.kind).toBe("linkedin_export");
    expect(await src.importConnections()).toHaveLength(3);
  });

  it("ManualConnectionSource normalizes one person", async () => {
    const [row] = await new ManualConnectionSource({ fullName: "  Alex   Chen ", company: "AMD", linkedinUrl: "linkedin.com/in/Alex-Chen-1" }).importConnections();
    expect(row).toMatchObject({ fullName: "Alex Chen", normalizedName: "alex chen", linkedinKey: "alex-chen-1" });
  });
});
