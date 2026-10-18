import { describe, expect, it } from "vitest";
import { newPasswordSchema, signInSchema, signUpSchema } from "./credentials";

describe("signUpSchema", () => {
  it("accepts a valid email and matching passwords", () => {
    expect(signUpSchema.safeParse({ email: "a@b.co", password: "longenough", confirm: "longenough" }).success).toBe(true);
  });
  it("rejects short passwords", () => {
    expect(signUpSchema.safeParse({ email: "a@b.co", password: "short", confirm: "short" }).success).toBe(false);
  });
  it("rejects mismatched confirmation", () => {
    const r = signUpSchema.safeParse({ email: "a@b.co", password: "longenough", confirm: "different1" });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.path).toEqual(["confirm"]);
  });
  it("rejects a bad email", () => {
    expect(signUpSchema.safeParse({ email: "nope", password: "longenough", confirm: "longenough" }).success).toBe(false);
  });
});

describe("signInSchema", () => {
  it("requires a password but not a length", () => {
    expect(signInSchema.safeParse({ email: "a@b.co", password: "x" }).success).toBe(true);
    expect(signInSchema.safeParse({ email: "a@b.co", password: "" }).success).toBe(false);
  });
});

describe("newPasswordSchema", () => {
  it("needs matching passwords of enough length", () => {
    expect(newPasswordSchema.safeParse({ password: "longenough", confirm: "longenough" }).success).toBe(true);
    expect(newPasswordSchema.safeParse({ password: "longenough", confirm: "other" }).success).toBe(false);
  });
});
