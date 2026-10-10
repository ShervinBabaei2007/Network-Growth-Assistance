import { describe, expect, it } from "vitest";
import {
  parseConnectionsCsv,
  parseExportDate,
  parseExportDateTime,
  parseInvitationsCsv,
  planExportImport,
  type KnownCandidate,
} from "./linkedin-export";

const CONNECTIONS = [
  "Notes:",
  '"When exporting your connection data, you may notice that some of the email addresses are missing."',
  "",
  "First Name,Last Name,URL,Email Address,Company,Position,Connected On",
  "Ada,Lovelace,https://www.linkedin.com/in/ada,ada@example.com,University of British Columbia,Computer Engineering Student,08 Oct 2026",
  "Old,Friend,https://www.linkedin.com/in/old-friend,,Acme,Engineer,14 Mar 2022",
  "New,Person,https://www.linkedin.com/in/new-person,,University of Waterloo,Mechatronics Engineering,05 Oct 2026",
  "Hidden,Member,,,,,01 Oct 2026",
  "Pending,Accepted,https://www.linkedin.com/in/pending-accepted,,UBC,ELEC,07 Oct 2026",
].join("\n");

const INVITATIONS = [
  "From,To,Sent At,Message,Direction,inviterProfileUrl,inviteeProfileUrl",
  'Me,Grace H,"10/2/26, 3:04 PM","Hi Grace, fellow engineer!",OUTGOING,https://www.linkedin.com/in/me,https://www.linkedin.com/in/grace-h',
  "Someone,Me,\"10/3/26, 9:00 AM\",,INCOMING,https://www.linkedin.com/in/someone,https://www.linkedin.com/in/me",
  'Me,Ada L,"10/1/26, 12:30 AM",,OUTGOING,https://www.linkedin.com/in/me,https://www.linkedin.com/in/ada',
].join("\n");

describe("export dates", () => {
  it.each([
    ["08 Oct 2026", "2026-10-08"],
    ["8 Oct 2026", "2026-10-08"],
    ["2026-10-08", "2026-10-08"],
    ["10/8/2026", "2026-10-08"],
    ["sometime", null],
  ])("%s → %s", (input, expected) => {
    expect(parseExportDate(input)).toBe(expected);
  });

  it("parses US-style date-times with AM/PM", () => {
    expect(parseExportDateTime("10/2/26, 3:04 PM")).toBe("2026-10-02T15:04");
    expect(parseExportDateTime("10/1/26, 12:30 AM")).toBe("2026-10-01T00:30");
    expect(parseExportDateTime("10/1/26, 12:05 PM")).toBe("2026-10-01T12:05");
  });
});

describe("parseConnectionsCsv", () => {
  it("skips the notes preamble and never reads email", () => {
    const r = parseConnectionsCsv(CONNECTIONS);
    expect(r.rows.map((c) => c.key)).toEqual(["ada", "old-friend", "new-person", "pending-accepted"]);
    expect(r.skipped).toBe(1);
    expect(r.rows[0]).toEqual({
      key: "ada",
      url: "https://www.linkedin.com/in/ada",
      fullName: "Ada Lovelace",
      company: "University of British Columbia",
      position: "Computer Engineering Student",
      connectedOn: "2026-10-08",
    });
    expect(JSON.stringify(r)).not.toContain("@example.com");
  });

  it("rejects other files", () => {
    expect(parseConnectionsCsv("a,b\n1,2").error).toContain("Connections.csv");
  });
});

describe("parseInvitationsCsv", () => {
  it("keeps outgoing invitations only", () => {
    const r = parseInvitationsCsv(INVITATIONS);
    expect(r.incoming).toBe(1);
    expect(r.rows).toEqual([
      { key: "grace-h", url: "https://www.linkedin.com/in/grace-h", name: "Grace H", sentAtLocal: "2026-10-02T15:04", message: "Hi Grace, fellow engineer!" },
      { key: "ada", url: "https://www.linkedin.com/in/ada", name: "Ada L", sentAtLocal: "2026-10-01T00:30", message: "" },
    ]);
  });
});

describe("planExportImport", () => {
  const known = new Map<string, KnownCandidate>([
    ["ada", { id: "c-ada", status: "approved", invitation: "none" }],
    ["grace-h", { id: "c-grace", status: "approved", invitation: "none" }],
    ["old-friend", { id: "c-old", status: "awaiting_review", invitation: "none" }],
    ["pending-accepted", { id: "c-pa", status: "invitation_pending", invitation: "pending" }],
    ["gone", { id: "c-gone", status: "invitation_pending", invitation: "pending" }],
  ]);

  const plan = planExportImport({
    connections: parseConnectionsCsv(CONNECTIONS).rows,
    connectionsSkipped: 1,
    invitations: parseInvitationsCsv(INVITATIONS).rows,
    known,
    projectStartDate: "2026-10-01",
  });

  it("records outgoing invitations that weren't logged", () => {
    expect(plan.recordSent.map((r) => r.candidateId)).toEqual(["c-grace", "c-ada"]);
  });

  it("resolves invitations LinkedIn now shows as connections, including ones just recorded", () => {
    expect(plan.resolveAccepted).toEqual([
      { candidateId: "c-ada", connectedOn: "2026-10-08" },
      { candidateId: "c-pa", connectedOn: "2026-10-07" },
    ]);
  });

  it("marks older connections as pre-existing rather than new", () => {
    expect(plan.markConnected).toEqual([{ candidateId: "c-old", connectedOn: "2022-03-14", preexisting: true }]);
  });

  it("offers new connections since the start that aren't candidates", () => {
    expect(plan.newConnections.map((c) => c.key)).toEqual(["new-person"]);
  });

  it("flags pending invitations that vanished from LinkedIn without assuming an outcome", () => {
    expect(plan.pendingMissingFromExport).toBe(1);
  });

  it("counts every connection row toward the total, including hidden members", () => {
    expect(plan.totalConnections).toBe(5);
  });
});
