import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NoteFacts } from "./index";

vi.mock("server-only", () => ({}));

const create = vi.fn();
vi.mock("@anthropic-ai/sdk", () => {
  class APIError extends Error {
    status?: number;
    constructor(status?: number) {
      super("api error");
      this.status = status;
    }
  }
  class RateLimitError extends APIError {}
  class AuthenticationError extends APIError {}
  class Anthropic {
    static APIError = APIError;
    static RateLimitError = RateLimitError;
    static AuthenticationError = AuthenticationError;
    beta = { messages: { create } };
  }
  return { default: Anthropic };
});

const { rewriteNoteWithClaude, NOTE_MODEL } = await import("./claude");
const Anthropic = (await import("@anthropic-ai/sdk")).default as unknown as {
  RateLimitError: new (s?: number) => Error;
  AuthenticationError: new (s?: number) => Error;
};

const facts: NoteFacts = {
  candidateId: "c1",
  fullName: "Ada Lovelace",
  university: "ubc",
  discipline: "ce",
  programText: "Computer Engineering",
  candidateNotes: "UBC Rocket team",
  me: { school: "BCIT", program: "Computer Systems Technology", interests: null },
};

const reply = (text: string, stop_reason = "end_turn") => ({ stop_reason, content: [{ type: "thinking", thinking: "" }, { type: "text", text }] });

describe("rewriteNoteWithClaude", () => {
  beforeEach(() => {
    process.env.ANTHROPIC_API_KEY = "test-key";
    create.mockReset();
  });
  afterEach(() => {
    delete process.env.ANTHROPIC_API_KEY;
  });

  it("does nothing without an API key", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    expect(await rewriteNoteWithClaude(facts, "draft", 200)).toMatchObject({ ok: false });
    expect(create).not.toHaveBeenCalled();
  });

  it("sends only the known facts, at low effort, with refusal fallbacks", async () => {
    create.mockResolvedValue(reply("Hi Ada, I saw you're on the UBC Rocket team. I study at BCIT and would love to connect."));
    const r = await rewriteNoteWithClaude(facts, "Hi Ada, draft.", 200);
    expect(r).toEqual({ ok: true, text: "Hi Ada, I saw you're on the UBC Rocket team. I study at BCIT and would love to connect." });
    const req = create.mock.calls[0][0];
    expect(req).toMatchObject({
      model: NOTE_MODEL,
      output_config: { effort: "low" },
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
    });
    expect(req.thinking).toBeUndefined();
    expect(req.messages[0].content).toContain("Character limit: 200");
    expect(req.messages[0].content).toContain("UBC Rocket team");
  });

  it("strips wrapping quotes", async () => {
    create.mockResolvedValue(reply("“Hi Ada, I'd like to connect.”"));
    expect(await rewriteNoteWithClaude(facts, "d", 200)).toEqual({ ok: true, text: "Hi Ada, I'd like to connect." });
  });

  it("discards drafts that invent facts, imply meetings or run long", async () => {
    create.mockResolvedValueOnce(reply("Hi Ada, I loved your internship at Tesla."));
    expect(await rewriteNoteWithClaude(facts, "d", 200)).toMatchObject({ ok: false, reason: expect.stringContaining("discarded") });
    create.mockResolvedValueOnce(reply("Hi Ada, great meeting you last week."));
    expect(await rewriteNoteWithClaude(facts, "d", 200)).toMatchObject({ ok: false });
    create.mockResolvedValueOnce(reply("Hi Ada, ".repeat(30)));
    expect(await rewriteNoteWithClaude(facts, "d", 200)).toMatchObject({ ok: false });
  });

  it("handles a refusal without using the content", async () => {
    create.mockResolvedValue(reply("ignored", "refusal"));
    expect(await rewriteNoteWithClaude(facts, "d", 200)).toMatchObject({ ok: false, reason: expect.stringContaining("declined") });
  });

  it("maps API errors to readable messages", async () => {
    create.mockRejectedValueOnce(new Anthropic.RateLimitError(429));
    expect(await rewriteNoteWithClaude(facts, "d", 200)).toMatchObject({ ok: false, reason: expect.stringContaining("busy") });
    create.mockRejectedValueOnce(new Anthropic.AuthenticationError(401));
    expect(await rewriteNoteWithClaude(facts, "d", 200)).toMatchObject({ ok: false, reason: expect.stringContaining("rejected") });
    create.mockRejectedValueOnce(new Error("socket hang up"));
    expect(await rewriteNoteWithClaude(facts, "d", 200)).toMatchObject({ ok: false, reason: "Couldn't reach Claude." });
  });
});
