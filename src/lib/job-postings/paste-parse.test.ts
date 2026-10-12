import { describe, expect, it } from "vitest";
import { groundPastedFields, parsePastedPage } from "./paste-parse";

/** Shaped like Ctrl+A, Ctrl+C on a LinkedIn job page (fictional company). */
const LINKEDIN = `Skip to main content
Home
My Network
Jobs
Messaging
Notifications
Harbourview Health
Registered Nurse - Emergency
Vancouver, BC · 3 days ago · 48 applicants
Full-time
Easy Apply
Save
About the job
Harbourview Health is hiring a Registered Nurse for our emergency department.
Requirements
• Current BCCNM registration
• BLS and ACLS certification
• 2+ years of acute care experience
Show more
About the company
Harbourview Health
1,200 followers`;

/** Shaped like an Indeed job page copy. */
const INDEED = `Indeed
Find jobs
Company reviews
Retail Sales Associate
Maple Outfitters
Calgary, AB
$17–$19 an hour - Part-time
Apply now
Full job description
Maple Outfitters is looking for a friendly Retail Sales Associate.
• Cash handling and POS experience
• Weekend availability
Report job`;

/** An employer's own careers page, outside Canada. */
const EMPLOYER = `Careers at Fjord Studio
UX Designer
Berlin, Germany (Hybrid)
Job description
We're looking for a UX Designer to shape our booking app.
• 3+ years of product design
• Figma and user research
Apply`;

describe("parsePastedPage: suggestions from a pasted job page", () => {
  it("reads a LinkedIn job page", () => {
    expect(parsePastedPage(LINKEDIN)).toEqual({
      title: "Registered Nurse - Emergency",
      company: "Harbourview Health",
      city: "Vancouver",
      region: "BC",
      country: "CA",
      remote: false,
      description: expect.stringContaining("BLS and ACLS certification"),
    });
    // The page's own chrome after the posting isn't part of the description.
    expect(parsePastedPage(LINKEDIN).description).not.toMatch(/followers|About the company/);
  });

  it("reads an Indeed job page", () => {
    expect(parsePastedPage(INDEED)).toMatchObject({ title: "Retail Sales Associate", company: "Maple Outfitters", city: "Calgary", region: "AB", country: "CA" });
    expect(parsePastedPage(INDEED).description).toContain("Cash handling and POS experience");
    expect(parsePastedPage(INDEED).description).not.toContain("Report job");
  });

  it("reads an employer page in another country", () => {
    expect(parsePastedPage(EMPLOYER)).toMatchObject({ title: "UX Designer", city: "Berlin", country: "DE", region: null });
  });

  it("only ever suggests text that is in the paste, and leaves the rest empty", () => {
    for (const page of [LINKEDIN, INDEED, EMPLOYER]) {
      const r = parsePastedPage(page);
      for (const v of [r.title, r.company, r.city]) if (v) expect(page).toContain(v);
    }
    expect(parsePastedPage("Just some notes about my day.")).toEqual({ title: null, company: null, city: null, region: null, country: null, remote: false, description: null });
  });

  it("notices a remote job", () => {
    expect(parsePastedPage("Customer Support Specialist\nAcme\nRemote - Canada\nAbout the job\nHelp customers.")).toMatchObject({ remote: true, country: "CA", title: "Customer Support Specialist", company: "Acme" });
  });
});

describe("groundPastedFields: the AI's reading keeps only what the paste says", () => {
  it("keeps values found in the paste and drops invented ones", () => {
    expect(groundPastedFields({ title: "Registered  Nurse - Emergency", company: "Harbourview Health", location: "Vancouver, BC" }, LINKEDIN)).toEqual({
      title: "Registered Nurse - Emergency",
      company: "Harbourview Health",
      city: "Vancouver",
      region: "BC",
      country: "CA",
      remote: false,
    });
    expect(groundPastedFields({ title: "Senior Nurse Manager", company: "Fraser Health", location: "Seattle, WA" }, LINKEDIN)).toEqual({ title: null, company: null, city: null, region: null, country: null, remote: false });
  });
});
