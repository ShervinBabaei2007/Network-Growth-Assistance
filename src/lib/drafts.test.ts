import { describe, expect, it } from "vitest";
import { clearDraft, DRAFT_MAX_AGE_MS, draftKey, isDirty, loadDraft, parseFields, saveDraft, serializeFields, type DraftStore } from "./drafts";

function memory(): DraftStore & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
  };
}

describe("isDirty", () => {
  it("ignores surrounding whitespace", () => {
    expect(isDirty("  hi ", "hi")).toBe(false);
    expect(isDirty("hi!", "hi")).toBe(true);
  });
});

describe("drafts", () => {
  it("keeps and returns a draft per record", () => {
    const store = memory();
    saveDraft(draftKey("job-note", "a"), "one", store, 1000);
    saveDraft(draftKey("job-note", "b"), "two", store, 1000);
    expect(loadDraft(draftKey("job-note", "a"), store, 2000)).toBe("one");
    expect(loadDraft(draftKey("job-note", "b"), store, 2000)).toBe("two");
  });

  it("forgets a draft after it is cleared", () => {
    const store = memory();
    const key = draftKey("job-note", "a");
    saveDraft(key, "one", store, 1000);
    clearDraft(key, store);
    expect(loadDraft(key, store, 2000)).toBeNull();
  });

  it("ignores and removes a stale draft", () => {
    const store = memory();
    const key = draftKey("job-note", "a");
    saveDraft(key, "old", store, 0);
    expect(loadDraft(key, store, DRAFT_MAX_AGE_MS + 1)).toBeNull();
    expect(store.data.size).toBe(0);
  });

  it("ignores damaged data instead of throwing", () => {
    const store = memory();
    store.setItem("k", "{not json");
    expect(loadDraft("k", store)).toBeNull();
    store.setItem("k", JSON.stringify({ v: 5, t: "x" }));
    expect(loadDraft("k", store)).toBeNull();
  });

  it("does nothing without storage, and skips very long text", () => {
    expect(loadDraft("k", null)).toBeNull();
    expect(() => saveDraft("k", "x", null)).not.toThrow();
    const store = memory();
    saveDraft("k", "x".repeat(25_000), store);
    expect(store.data.size).toBe(0);
  });

  it("survives storage that throws", () => {
    const broken: DraftStore = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("full");
      },
      removeItem: () => {
        throw new Error("blocked");
      },
    };
    expect(() => saveDraft("k", "x", broken)).not.toThrow();
    expect(loadDraft("k", broken)).toBeNull();
    expect(() => clearDraft("k", broken)).not.toThrow();
  });
});

describe("form drafts", () => {
  it("round-trips fields in a stable order", () => {
    const a = serializeFields({ notes: "n", tags: "t" });
    expect(serializeFields({ tags: "t", notes: "n" })).toBe(a);
    expect(parseFields(a)).toEqual({ notes: "n", tags: "t" });
  });
  it("rejects anything that is not a flat object of strings", () => {
    expect(parseFields("[1]")).toBeNull();
    expect(parseFields("nope")).toBeNull();
    expect(parseFields('{"a":1,"b":"x"}')).toEqual({ b: "x" });
  });
});
