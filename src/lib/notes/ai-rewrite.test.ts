import { describe, expect, it, vi } from "vitest";
import type { LLMProvider } from "@/lib/discovery/llm";
import type { NoteFacts } from "./index";

vi.mock("server-only", () => ({}));

const { rewriteNoteWithAI, aiNotesEnabled } = await import("./ai-rewrite");

const facts: NoteFacts = {
  candidateId: "c1",
  fullName: "Ada Lovelace",
  university: { name: "UBC", aliases: ["University of British Columbia"] },
  discipline: { name: "Computer Engineering", aliases: ["comp eng"] },
  programText: "Computer Engineering",
  candidateNotes: "UBC Rocket team",
  me: { school: "BCIT", program: "Computer Systems Technology", interests: null },
};

/** A stand-in model service: returns the queued answers in order and records each request. */
function fakeLlm(...answers: ({ ok: true; data: unknown } | { ok: false; reason: string })[]) {
  const calls: { system: string; user: string }[] = [];
  const llm: LLMProvider = {
    enabled: true,
    async structured(opts) {
      calls.push({ system: opts.system, user: opts.user });
      const next = answers.shift() ?? { ok: false, reason: "no answer queued" };
      if (!next.ok) return next;
      const parsed = opts.schema.safeParse(next.data);
      return parsed.success ? { ok: true, data: parsed.data } : { ok: false, reason: "The model's answer failed validation." };
    },
  };
  return { llm, calls };
}
const note = (text: string) => ({ ok: true as const, data: { note: text } });

describe("rewriteNoteWithAI", () => {
  it("does nothing when AI is off", async () => {
    const off: LLMProvider = { enabled: false, structured: vi.fn() };
    expect(aiNotesEnabled(off)).toBe(false);
    expect(await rewriteNoteWithAI(facts, "draft", 200, off)).toMatchObject({ ok: false });
    expect(off.structured).not.toHaveBeenCalled();
  });

  it("sends only the known facts and the limit", async () => {
    const { llm, calls } = fakeLlm(note("Hi Ada, I saw you're on the UBC Rocket team. I study at BCIT and would love to connect."));
    const r = await rewriteNoteWithAI(facts, "Hi Ada, draft.", 200, llm);
    expect(r).toEqual({ ok: true, text: "Hi Ada, I saw you're on the UBC Rocket team. I study at BCIT and would love to connect." });
    expect(calls[0].user).toContain("Character limit: 200");
    expect(calls[0].user).toContain("UBC Rocket team");
  });

  it("strips wrapping quotes", async () => {
    const { llm } = fakeLlm(note("“Hi Ada, I'd like to connect.”"));
    expect(await rewriteNoteWithAI(facts, "d", 200, llm)).toEqual({ ok: true, text: "Hi Ada, I'd like to connect." });
  });

  it("discards drafts that invent facts, imply meetings or run long", async () => {
    const { llm } = fakeLlm(note("Hi Ada, I loved your internship at Tesla."), note("Hi Ada, great meeting you last week."), note("Hi Ada, ".repeat(30)));
    expect(await rewriteNoteWithAI(facts, "d", 200, llm)).toMatchObject({ ok: false, reason: expect.stringContaining("discarded") });
    expect(await rewriteNoteWithAI(facts, "d", 200, llm)).toMatchObject({ ok: false });
    expect(await rewriteNoteWithAI(facts, "d", 200, llm)).toMatchObject({ ok: false });
  });

  it("passes on the service's failure (refusal, busy, rejected key) and keeps the template", async () => {
    const { llm } = fakeLlm({ ok: false, reason: "The model declined this request." }, { ok: false, reason: "The Gemini API key was rejected." });
    expect(await rewriteNoteWithAI(facts, "d", 200, llm)).toMatchObject({ ok: false, reason: expect.stringContaining("declined") });
    expect(await rewriteNoteWithAI(facts, "d", 200, llm)).toMatchObject({ ok: false, reason: expect.stringContaining("template suggestion is still there") });
  });

  it("rejects a malformed answer", async () => {
    const { llm } = fakeLlm({ ok: true, data: { text: "wrong field" } });
    expect(await rewriteNoteWithAI(facts, "d", 200, llm)).toMatchObject({ ok: false, reason: expect.stringContaining("validation") });
  });
});
