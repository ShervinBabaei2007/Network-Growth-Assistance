import { describe, expect, it } from "vitest";
import { columnLabel, dragAnnouncement, dropOutcome } from "./drop";

describe("dropOutcome", () => {
  it("moves a card to another open stage", () => expect(dropOutcome("interviewing", "applied")).toEqual({ kind: "move", to: "interviewing" }));
  it("does nothing when dropped where it already is", () => expect(dropOutcome("applied", "applied")).toEqual({ kind: "none" }));
  it("asks which closed outcome instead of guessing", () => expect(dropOutcome("closed", "offer").kind).toBe("hint"));
  it("does nothing for a card that is already closed and dropped on Closed", () => expect(dropOutcome("closed", "rejected")).toEqual({ kind: "none" }));
  it("reopens a closed card dropped on an open stage", () => expect(dropOutcome("applied", "rejected")).toEqual({ kind: "move", to: "applied" }));
  it("ignores unknown columns", () => expect(dropOutcome("nope", "saved")).toEqual({ kind: "none" }));
});

describe("announcements", () => {
  it("names the column", () => expect(dragAnnouncement("Dev at Acme", "saved", "offer")).toBe("Dev at Acme is over Offer."));
  it("says when not over a column", () => expect(dragAnnouncement("Dev at Acme", "saved", null)).toContain("not over a column"));
  it("labels the closed column", () => expect(columnLabel("closed")).toBe("Closed"));
});
