import { describe, expect, it } from "vitest";
import { translator } from "@/lib/i18n";
import { MAX_SELECTION } from "@/lib/selection";
import { restoreByPrevious, selectedIds, withSkipped } from "./bulk-change";
import { createMutate } from "./mutation-core";

const id = (n: number) => `0b7c6c52-62a0-4d5b-9a0e-${String(n).padStart(12, "0")}`;

describe("selectedIds", () => {
  it("returns the ids when there are between 1 and the cap", () => {
    expect(selectedIds([id(1), id(2)], "people")).toEqual([id(1), id(2)]);
    expect(selectedIds(Array.from({ length: MAX_SELECTION }, (_, i) => id(i)), "people")).toHaveLength(MAX_SELECTION);
  });

  it.each([[[]], [undefined], ["nope"], [[id(1), "not-a-uuid"]], [[1, 2]]])("fails an empty or malformed selection: %j", (raw) => {
    expect(selectedIds(raw, "people")).toMatchObject({ ok: false, message: "candidatesPage.bulkSelectEmpty" });
  });

  it("fails more than the cap, with the cap as a parameter and the right noun", () => {
    const tooMany = Array.from({ length: MAX_SELECTION + 1 }, (_, i) => id(i));
    expect(selectedIds(tooMany, "people")).toMatchObject({ ok: false, message: "bulkChange.tooManyPeople", params: { max: MAX_SELECTION } });
    expect(selectedIds(tooMany, "applications")).toMatchObject({ ok: false, message: "bulkChange.tooManyApplications" });
    expect(selectedIds([], "applications")).toMatchObject({ message: "applicationsPage.selectAtLeast" });
  });

  it("tells the person in French through a mutation", async () => {
    const mutate = createMutate({ context: async () => ({}), translator: async () => translator("fr-CA"), refresh: () => {}, log: async () => {} });
    const tooMany = Array.from({ length: MAX_SELECTION + 1 }, (_, i) => id(i));
    const r = await mutate({}, async () => {
      const picked = selectedIds(tooMany, "people");
      return Array.isArray(picked) ? { ok: true as const } : picked;
    });
    expect(r).toEqual({ ok: false, error: "Sélectionnez au plus 200 personnes à la fois." });
  });
});

describe("withSkipped", () => {
  const t = translator("en");
  it("ends the sentence, or says how many were skipped", () => {
    expect(withSkipped(t, "3 marked sent", 0, "candidatesPage.bulkSkipped")).toBe("3 marked sent.");
    expect(withSkipped(t, "3 marked sent", 2, "candidatesPage.bulkSkipped")).toBe("3 marked sent. 2 skipped.");
  });
});

describe("restoreByPrevious", () => {
  it("restores each distinct previous value in one go, with that value's ids", async () => {
    const calls: [string, string[]][] = [];
    const ok = await restoreByPrevious(
      [
        { id: "a", previous: "new" },
        { id: "b", previous: "approved" },
        { id: "c", previous: "new" },
      ],
      async (previous, ids) => {
        calls.push([previous, ids]);
        return { error: null };
      },
    );
    expect(ok).toBe(true);
    expect(calls).toEqual([
      ["new", ["a", "c"]],
      ["approved", ["b"]],
    ]);
  });

  it("handles a null previous value (a reminder that was never set)", async () => {
    const seen: (string | null)[] = [];
    await restoreByPrevious([{ id: "a", previous: null }], async (previous) => {
      seen.push(previous);
      return { error: null };
    });
    expect(seen).toEqual([null]);
  });

  it("stops at the first failure and reports it", async () => {
    let calls = 0;
    const ok = await restoreByPrevious(
      [
        { id: "a", previous: 1 },
        { id: "b", previous: 2 },
      ],
      async () => {
        calls++;
        return { error: { message: "boom" } };
      },
    );
    expect(ok).toBe(false);
    expect(calls).toBe(1);
  });
});
