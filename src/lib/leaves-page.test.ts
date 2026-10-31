import { describe, expect, it } from "vitest";
import { leavesPage } from "./leaves-page";

const here = { origin: "https://app.test", pathname: "/jobs/123", search: "" };
const link = (href: string) => new URL(href, "https://app.test/jobs/123");

describe("leavesPage", () => {
  it("is true for another page of the app", () => {
    expect(leavesPage(link("/overview"), here)).toBe(true);
    expect(leavesPage(link("/jobs/123?tab=notes"), here)).toBe(true);
  });
  it("is false for the same page, with or without a hash", () => {
    expect(leavesPage(link("/jobs/123"), here)).toBe(false);
    expect(leavesPage(link("/jobs/123#documents"), here)).toBe(false);
  });
  it("is false for a file download served from an API route", () => {
    expect(leavesPage(link("/api/jobs/documents/abc/download?format=pdf"), here)).toBe(false);
  });
  it("is false for another site and for non-web links", () => {
    expect(leavesPage(link("https://example.com/x"), here)).toBe(false);
    expect(leavesPage(link("mailto:someone@example.com"), here)).toBe(false);
  });
});
