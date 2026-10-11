import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
process.env.APP_ENCRYPTION_KEY = "test-key-that-is-at-least-32-characters-long";

const { backoffMinutes, dateJob } = await import("./crawler");
const { decryptSecret, encryptSecret } = await import("./ai");

const NOW = new Date("2026-10-11T18:00:00Z");

describe("dateJob", () => {
  it("uses the board's own publish time", () => {
    expect(dateJob({ postedAt: "2026-10-11T09:00:00-04:00", precision: "time" }, true, NOW)).toEqual({ postedAt: "2026-10-11T13:00:00.000Z", dateSource: "source" });
  });
  it("dates a new job by when it appeared on a board read before", () => {
    expect(dateJob({ postedAt: null, precision: "time" }, false, NOW)).toEqual({ postedAt: NOW.toISOString(), dateSource: "first_seen" });
    expect(dateJob({ postedAt: "2026-10-11T00:00:00Z", precision: "day" }, false, NOW)).toEqual({ postedAt: NOW.toISOString(), dateSource: "first_seen" });
  });
  it("never calls a job recent on a board's first read without a time", () => {
    expect(dateJob({ postedAt: null, precision: "time" }, true, NOW).dateSource).toBe("unknown");
    expect(dateJob({ postedAt: "2026-10-11T00:00:00Z", precision: "day" }, true, NOW).dateSource).toBe("unknown");
  });
});

describe("backoffMinutes", () => {
  it("doubles from 30 minutes up to a day", () => {
    expect([1, 2, 3, 4, 10].map(backoffMinutes)).toEqual([30, 60, 120, 240, 1440]);
  });
});

describe("own AI keys", () => {
  it("encrypts and decrypts, and rejects tampering", () => {
    const stored = encryptSecret("sk-ant-api03-abcdefghijklmnopqrstuvwxyz");
    expect(stored).not.toContain("abcdef");
    expect(decryptSecret(stored)).toBe("sk-ant-api03-abcdefghijklmnopqrstuvwxyz");
    const [v, iv, tag, data] = stored.split(":");
    expect(decryptSecret([v, iv, tag, `A${data.slice(1)}`].join(":"))).toBeNull();
    expect(encryptSecret("same")).not.toBe(encryptSecret("same"));
  });
});
