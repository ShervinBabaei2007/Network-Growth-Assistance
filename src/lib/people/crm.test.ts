import { describe, expect, it } from "vitest";
import { CONNECTED_PATCH, PERSON_STATUSES, savesPerson, statusInteractionKind } from "./crm";
import { CRM_STATUS_LABELS } from "@/lib/discovery/labels";

describe("CRM status rules", () => {
  it("covers exactly the statuses the app has labels for", () => {
    expect([...PERSON_STATUSES].sort()).toEqual(Object.keys(CRM_STATUS_LABELS).sort());
  });

  it("leaves the history entry the single and bulk actions both need", () => {
    expect(statusInteractionKind("connection_sent_manually")).toBe("marked_sent");
    expect(statusInteractionKind("replied")).toBe("replied");
    expect(statusInteractionKind("shortlisted")).toBe("status_change");
    expect(statusInteractionKind("not_relevant")).toBe("status_change");
  });

  it("saves a person to People for every status except not relevant", () => {
    expect(savesPerson("not_relevant")).toBeUndefined();
    for (const s of PERSON_STATUSES.filter((s) => s !== "not_relevant")) expect(savesPerson(s)).toBe(true);
  });

  it("counts a person marked connected as a known connection", () => {
    expect(CONNECTED_PATCH).toEqual({ proximity: "connected", known_match_state: "confirmed_same" });
  });
});
