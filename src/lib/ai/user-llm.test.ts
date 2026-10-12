import { beforeEach, describe, expect, it, vi } from "vitest";

const access = vi.fn();
const consumeQuota = vi.fn();
vi.mock("@/lib/job-postings/ai", () => ({ aiAccess: (...a: unknown[]) => access(...a), consumeQuota: (...a: unknown[]) => consumeQuota(...a) }));

const { getUserLLM } = await import("./index");
const llm = { enabled: true, structured: vi.fn() };
const db = {} as never;

describe("getUserLLM", () => {
  beforeEach(() => {
    access.mockReset();
    consumeQuota.mockReset();
  });

  it("charges the daily allowance when the server's key is used", async () => {
    access.mockResolvedValue({ ok: true, llm, source: "operator", remaining: 2, vendor: "gemini" });
    consumeQuota.mockResolvedValue(false);
    const s = await getUserLLM(db, "u1");
    expect(s.ok && (await s.charge())).toBe(false);
    expect(consumeQuota).toHaveBeenCalledWith("u1");
  });

  it("never charges the allowance for the user's own key", async () => {
    access.mockResolvedValue({ ok: true, llm, source: "own", remaining: null, vendor: "gemini" });
    const s = await getUserLLM(db, "u1");
    expect(s.ok && (await s.charge())).toBe(true);
    expect(consumeQuota).not.toHaveBeenCalled();
  });

  it("passes on why AI isn't available", async () => {
    access.mockResolvedValue({ ok: false, code: "quota_exhausted", reason: "used up" });
    expect(await getUserLLM(db, "u1")).toEqual({ ok: false, code: "quota_exhausted", reason: "used up" });
    expect(llm.structured).not.toHaveBeenCalled();
  });
});
