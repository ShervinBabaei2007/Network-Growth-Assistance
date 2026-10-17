import { describe, expect, it } from "vitest";
import { errorMessage, redact } from "./log";

describe("redact", () => {
  it("removes keys, tokens and emails from messages", () => {
    const text = redact(
      "failed for sam@example.com with key AIzaSyA1234567890abcdefghijk, AQ.Ab8RN6TEST_not_a_real_key_000000 and Bearer abc.def.ghi123 at https://api.example.com/x?app_key=s3cret&page=2 (sk-ant-api03-abcdefghijkl)",
    );
    expect(text).not.toMatch(/sam@example\.com|AIzaSy|AQ\.Ab8|abc\.def|s3cret|sk-ant-api03/);
    expect(text).toContain("page=2");
  });

  it("removes JWTs", () => {
    expect(redact("token eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abcdefghijklmnop")).toBe("token [jwt]");
  });

  it("caps long messages", () => {
    expect(redact("x".repeat(2000))).toHaveLength(500);
  });

  it("handles anything thrown", () => {
    expect(errorMessage(new Error("boom"))).toBe("boom");
    expect(errorMessage("plain")).toBe("plain");
  });
});
