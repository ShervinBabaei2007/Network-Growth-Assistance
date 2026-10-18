import { describe, expect, it, vi } from "vitest";
import { createSelectionStore, MAX_SELECTION } from "./selection";

describe("selection store", () => {
  it("toggles rows and tells listeners", () => {
    const store = createSelectionStore();
    const listener = vi.fn();
    store.subscribe(listener);
    store.toggle("a", true);
    store.toggle("b", true);
    store.toggle("a", true); // already selected: no change, no notification
    expect(store.getSnapshot()).toEqual(["a", "b"]);
    expect(listener).toHaveBeenCalledTimes(2);
    store.toggle("a", false);
    expect(store.getSnapshot()).toEqual(["b"]);
  });
  it("selects and clears a whole page without duplicating", () => {
    const store = createSelectionStore();
    store.toggle("a", true);
    store.setMany(["a", "b", "c"], true);
    expect(store.getSnapshot()).toEqual(["a", "b", "c"]);
    store.setMany(["a", "b", "c"], false);
    expect(store.getSnapshot()).toEqual([]);
  });
  it("never holds more than the server accepts", () => {
    const store = createSelectionStore();
    store.setMany(Array.from({ length: MAX_SELECTION + 50 }, (_, i) => `id${i}`), true);
    expect(store.getSnapshot()).toHaveLength(MAX_SELECTION);
  });
  it("stops notifying after unsubscribe", () => {
    const store = createSelectionStore();
    const listener = vi.fn();
    const off = store.subscribe(listener);
    off();
    store.toggle("a", true);
    expect(listener).not.toHaveBeenCalled();
  });
});
