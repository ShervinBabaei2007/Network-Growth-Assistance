import { describe, expect, it } from "vitest";
import { nextRowIndex } from "./list-nav";

describe("nextRowIndex", () => {
  it("moves one row at a time", () => {
    expect(nextRowIndex(2, 5, "ArrowDown")).toBe(3);
    expect(nextRowIndex(2, 5, "ArrowUp")).toBe(1);
  });
  it("stops at the ends instead of wrapping", () => {
    expect(nextRowIndex(4, 5, "ArrowDown")).toBe(4);
    expect(nextRowIndex(0, 5, "ArrowUp")).toBe(0);
  });
  it("starts from the first row when nothing is current", () => {
    expect(nextRowIndex(-1, 5, "ArrowDown")).toBe(0);
    expect(nextRowIndex(-1, 5, "ArrowUp")).toBe(0);
  });
  it("jumps to the first and last", () => {
    expect(nextRowIndex(2, 5, "Home")).toBe(0);
    expect(nextRowIndex(2, 5, "End")).toBe(4);
  });
  it("ignores other keys and empty lists", () => {
    expect(nextRowIndex(2, 5, "a")).toBeNull();
    expect(nextRowIndex(0, 0, "ArrowDown")).toBeNull();
  });
});
