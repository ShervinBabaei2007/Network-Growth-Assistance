import { describe, expect, it } from "vitest";
import { formInt, optionalFormInt } from "./form-state";

describe("form number parsing", () => {
  it("parses whole numbers from form strings", () => {
    expect(formInt("Count").parse("1250")).toBe(1250);
  });

  it("rejects fractions, negatives and text with a readable message", () => {
    expect(formInt("Count").safeParse("12.5").error?.issues[0].message).toBe(
      "Count must be a whole number.",
    );
    expect(formInt("Count").safeParse("-1").error?.issues[0].message).toBe(
      "Count must be at least 0.",
    );
    expect(formInt("Count").safeParse("abc").success).toBe(false);
  });

  it("treats a blank optional field as not set", () => {
    expect(optionalFormInt("Cap").parse("")).toBeNull();
    expect(optionalFormInt("Cap").parse("40")).toBe(40);
  });
});
