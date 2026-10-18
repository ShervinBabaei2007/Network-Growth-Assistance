import { describe, expect, it } from "vitest";
import { deviceFromUserAgent, normalizeRoute } from "./route";
import { scrubError } from "./scrub";

describe("normalizeRoute", () => {
  it("keeps fixed pages and replaces ids and slugs", () => {
    expect(normalizeRoute("/overview")).toBe("/overview");
    expect(normalizeRoute("/")).toBe("/");
    expect(normalizeRoute("/applications/3f2c1a9e-0000-4000-8000-000000000000")).toBe("/applications/[id]");
    expect(normalizeRoute("/candidates/import")).toBe("/candidates/import");
    expect(normalizeRoute("/candidates/abc123")).toBe("/candidates/[id]");
    expect(normalizeRoute("/companies/acme-corp")).toBe("/companies/[slug]");
    expect(normalizeRoute("/jobs/employers")).toBe("/jobs/employers");
    expect(normalizeRoute("/guides/build-a-networking-plan")).toBe("/guides/build-a-networking-plan");
    expect(normalizeRoute("/guides/someone-elses-slug")).toBe("/guides/[id]");
  });
  it("drops the query, fragment, trailing slash and anything deeper", () => {
    expect(normalizeRoute("/candidates?q=maya%20chen&status=approved#top")).toBe("/candidates");
    expect(normalizeRoute("/people/p1/extra/deeper/")).toBe("/people/[id]");
    expect(normalizeRoute("/applications/3f2c1a9e-0000-4000-8000-000000000000/prep")).toBe("/applications/[id]/prep");
  });
  it("never records an unknown path, which could hold anything", () => {
    expect(normalizeRoute("/maya.chen@example.com")).toBe("/other");
    expect(normalizeRoute("/wp-admin/setup.php")).toBe("/other");
    expect(normalizeRoute(null)).toBe("/");
  });
});

describe("deviceFromUserAgent", () => {
  it("separates phones from desktops and keeps nothing else", () => {
    expect(deviceFromUserAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Mobile/15E148")).toBe("phone");
    expect(deviceFromUserAgent("Mozilla/5.0 (Linux; Android 14; Pixel 7) Mobile")).toBe("phone");
    expect(deviceFromUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130")).toBe("desktop");
    expect(deviceFromUserAgent(undefined)).toBe("desktop");
  });
});

describe("scrubError", () => {
  const base = { source: "browser", route: "/overview" };
  it("removes emails, keys, tokens, ids, hosts, queries and profile links", () => {
    const out = scrubError({
      ...base,
      message: "Failed for maya.chen@example.com with key AIzaSyA1234567890abcdefghijklmn at https://app.example.com/candidates/3f2c1a9e-0000-4000-8000-000000000000?q=secret#x and https://www.linkedin.com/in/maya-chen-123 phone 6045551234",
      stack: "Error: boom\n    at Page (https://app.example.com/_next/static/chunks/app.js?v=abc:1:2)\n    at Bearer abcdefghijklmnop",
    });
    const all = `${out.message}\n${out.stack}`;
    expect(all).not.toMatch(/maya\.chen@example\.com|AIzaSy|secret|3f2c1a9e|6045551234|app\.example\.com|abcdefghijklmnop|\?v=/);
    expect(all).toContain("[email]");
    expect(all).toContain("/_next/static/chunks/app.js");
    expect(out.message).toContain("linkedin.com/in/[profile]");
    expect(out.message).not.toContain("maya-chen-123");
  });
  it("limits length and survives missing parts", () => {
    const out = scrubError({ ...base, message: "x".repeat(5000), stack: "y".repeat(9000) });
    expect(out.message.length).toBeLessThanOrEqual(300);
    expect(out.stack!.length).toBeLessThanOrEqual(1500);
    expect(scrubError({ ...base })).toMatchObject({ message: "Unknown error", stack: null });
  });
  it("groups the same failure in the same place, and separates different ones", () => {
    const a = scrubError({ ...base, message: "boom", stack: "Error: boom\n    at Foo (/a.js:1:1)" });
    const b = scrubError({ ...base, message: "boom", stack: "Error: boom\n    at Foo (/a.js:1:1)" });
    const c = scrubError({ ...base, route: "/queue", message: "boom", stack: "Error: boom\n    at Foo (/a.js:1:1)" });
    expect(a.fingerprint).toBe(b.fingerprint);
    expect(a.fingerprint).not.toBe(c.fingerprint);
    expect(a.fingerprint).toHaveLength(40);
  });
});
