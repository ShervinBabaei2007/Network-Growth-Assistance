import { describe, expect, it } from "vitest";
import { DEFAULT_AFTER_LOGIN, safeNextPath } from "./safe-next-path";

describe("safeNextPath", () => {
  it("keeps same-site paths with their query", () => {
    expect(safeNextPath("/candidates?status=approved")).toBe("/candidates?status=approved");
  });

  it.each([
    [null],
    [undefined],
    [""],
    ["overview"],
    ["https://evil.example/phish"],
    ["//evil.example"],
    ["/\\evil.example"],
  ])("falls back to the default for %s", (input) => {
    expect(safeNextPath(input)).toBe(DEFAULT_AFTER_LOGIN);
  });
});
