import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import type { LLMProvider, LlmResult, LlmTier } from "@/lib/discovery/llm";

vi.mock("server-only", () => ({}));

const { FallbackLLM, untilUtcMidnight } = await import("./fallback-llm");
const { OpenAICompatLLM, retryAfterMs } = await import("./openai-compat-provider");
const { GeminiLLM, geminiModels, retryAfterFrom } = await import("./gemini-provider");
const { defaultLLM, vendorOf } = await import("./default-llm");

const Out = z.object({ hello: z.string() });
const call = (llm: LLMProvider, tier: LlmTier = "fast") => llm.structured({ tier, system: "s", user: "u", schema: Out });

/** A stand-in service that answers from a queue and counts how often it is asked. */
function fake(...answers: LlmResult<{ hello: string }>[]) {
  const llm = {
    enabled: true,
    calls: 0,
    async structured() {
      llm.calls++;
      return (answers.length > 1 ? answers.shift() : answers[0]) as never;
    },
  };
  return llm;
}
const ok = (hello = "hi"): LlmResult<{ hello: string }> => ({ ok: true, data: { hello } });
const quota = (retryAfterMs?: number): LlmResult<{ hello: string }> => ({ ok: false, reason: "limit", kind: "quota", retryAfterMs });

/** A chain with its own list of resting services, so tests don't affect each other. */
const FreshChain = class extends FallbackLLM {
  constructor(entries: ConstructorParameters<typeof FallbackLLM>[0], now?: () => number) {
    super(entries, now, new Map());
  }
};

describe("FallbackLLM", () => {
  it("uses the first service and does not touch the others while it answers", async () => {
    const a = fake(ok("a"));
    const b = fake(ok("b"));
    const chain = new FreshChain([{ name: "a", llm: a }, { name: "b", llm: b }]);
    expect(await call(chain)).toEqual({ ok: true, data: { hello: "a" } });
    expect(b.calls).toBe(0);
  });

  it("moves to the next service when one is out of quota, and does not ask the spent one again until it resets", async () => {
    let now = 1_000;
    const a = fake(quota(60_000));
    const b = fake(ok("b"));
    const chain = new FreshChain([{ name: "a", llm: a }, { name: "b", llm: b }], () => now);
    expect(await call(chain)).toEqual({ ok: true, data: { hello: "b" } });
    await call(chain);
    expect(a.calls).toBe(1);
    expect(chain.available()).toEqual(["b"]);
    now += 61_000;
    await call(chain);
    expect(a.calls).toBe(2);
  });

  it("without a retry time, waits until the quotas reset at midnight UTC (never more than a day)", async () => {
    const midnight = Date.UTC(2026, 9, 19, 0, 0, 0);
    expect(untilUtcMidnight(midnight - 3_600_000)).toBe(3_600_000);
    let now = midnight - 3_600_000;
    const a = fake(quota());
    const chain = new FreshChain([{ name: "a", llm: a }, { name: "b", llm: fake(ok()) }], () => now);
    await call(chain);
    now += 3_599_000;
    expect(chain.available()).toEqual(["b"]);
    now += 2_000;
    expect(chain.available()).toEqual(["a", "b"]);
  });

  it("tries the next service at once when one is busy, but only skips it briefly", async () => {
    let now = 0;
    const a = fake({ ok: false, reason: "busy", kind: "busy" });
    const b = fake(ok("b"));
    const chain = new FreshChain([{ name: "a", llm: a }, { name: "b", llm: b }], () => now);
    expect(await call(chain)).toEqual({ ok: true, data: { hello: "b" } });
    now += 25_000;
    expect(chain.available()).toEqual(["a", "b"]);
  });

  it("does not rest a service because of a bad answer, only moves on for that request", async () => {
    const a = fake({ ok: false, reason: "failed validation", kind: "other" }, ok("a2"));
    const chain = new FreshChain([{ name: "a", llm: a }, { name: "b", llm: fake(ok("b")) }]);
    expect(await call(chain)).toEqual({ ok: true, data: { hello: "b" } });
    expect(chain.available()).toEqual(["a", "b"]);
  });

  it("puts services that prefer the kind of work first", async () => {
    const lite = fake(ok("lite"));
    const full = fake(ok("full"));
    const chain = new FreshChain([{ name: "full", llm: full, prefer: ["smart"] }, { name: "lite", llm: lite, prefer: ["fast"] }]);
    expect(await call(chain, "fast")).toEqual({ ok: true, data: { hello: "lite" } });
    expect(await call(chain, "smart")).toEqual({ ok: true, data: { hello: "full" } });
  });

  it("returns the last failure when every service fails, so the caller uses its non-AI path", async () => {
    const chain = new FreshChain([{ name: "a", llm: fake(quota()) }, { name: "b", llm: fake(quota()) }]);
    expect(await call(chain)).toMatchObject({ ok: false, kind: "quota" });
    expect(chain.available()).toEqual([]);
    expect(await call(chain)).toMatchObject({ ok: false });
  });

  it("adds up the usage of its services", () => {
    const a = Object.assign(fake(ok()), { usage: { calls: 2, inputTokens: 10, outputTokens: 5 } });
    const b = Object.assign(fake(ok()), { usage: { calls: 1, inputTokens: 4, outputTokens: 1 } });
    expect(new FreshChain([{ name: "a", llm: a }, { name: "b", llm: b }]).usage).toEqual({ calls: 3, inputTokens: 14, outputTokens: 6 });
  });
});

describe("OpenAI-compatible services (Groq, Mistral)", () => {
  const cfg = { name: "Groq", baseUrl: "https://api.example.test/v1", apiKey: "gsk_test", model: "m" };
  const chat = (content: string | null, finish = "stop") => new Response(JSON.stringify({ choices: [{ message: { content }, finish_reason: finish }], usage: { prompt_tokens: 7, completion_tokens: 3 } }));
  const llmFor = (...replies: Response[]) => {
    const fetchImpl = vi.fn(async () => replies.shift() ?? new Response("{}", { status: 500 })) as unknown as typeof fetch;
    return { llm: new OpenAICompatLLM(cfg, fetchImpl), fetchImpl };
  };

  it("sends the key in a header, asks for JSON in the schema's shape, and validates the answer", async () => {
    const { llm, fetchImpl } = llmFor(chat('{"hello":"world"}'));
    expect(await call(llm)).toEqual({ ok: true, data: { hello: "world" } });
    const [url, init] = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.example.test/v1/chat/completions");
    expect((init.headers as Record<string, string>).authorization).toBe("Bearer gsk_test");
    expect(String(init.body)).not.toContain("gsk_test");
    expect(JSON.parse(init.body as string)).toMatchObject({ model: "m", response_format: { type: "json_object" } });
    expect(llm.usage).toEqual({ calls: 1, inputTokens: 7, outputTokens: 3 });
  });

  it("asks once more when the first answer is not valid, then accepts the corrected one", async () => {
    const { llm, fetchImpl } = llmFor(chat('{"wrong":1}'), chat('```json\n{"hello":"fixed"}\n```'));
    expect(await call(llm)).toEqual({ ok: true, data: { hello: "fixed" } });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("gives up after the repair attempt", async () => {
    const { llm } = llmFor(chat("not json"), chat("still not"));
    expect(await call(llm)).toMatchObject({ ok: false, kind: "other" });
  });

  it("reports a reached limit as quota, with the time to wait", async () => {
    const { llm } = llmFor(new Response("{}", { status: 429, headers: { "retry-after": "90" } }));
    expect(await call(llm)).toMatchObject({ ok: false, kind: "quota", retryAfterMs: 90_000 });
    expect(retryAfterMs(null, "Please try again in 1m20.5s.")).toBe(80_500);
    expect(retryAfterMs(null, "no hint")).toBeUndefined();
  });

  it("is off without a key", async () => {
    expect(new OpenAICompatLLM({ ...cfg, apiKey: "" }).enabled).toBe(false);
  });
});

describe("Gemini quota replies", () => {
  it("reads how long Google says to wait", () => {
    expect(retryAfterFrom('{"details":[{"retryDelay":"84400s"}]}')).toBe(84_400_000);
    expect(retryAfterFrom("Please retry in 23h27m32.289788628s.")).toBe(84_452_290);
    expect(retryAfterFrom("something else")).toBeUndefined();
  });

  it("marks a 429 as quota, with the wait", async () => {
    const fetchImpl = (async () => new Response('{"error":{"message":"Please retry in 5m."}}', { status: 429 })) as unknown as typeof fetch;
    const r = await call(new GeminiLLM("AIzaSyTEST-not-a-real-key-000000000000", { fetchImpl, retryDelaysMs: [] }));
    expect(r).toMatchObject({ ok: false, kind: "quota", retryAfterMs: 300_000 });
  });
});

describe("which services the server chains", () => {
  const KEY = "AIzaSyTEST-not-a-real-key-000000000000";

  it("chains a lite and a full Gemini model by default, each with its own quota", () => {
    expect(geminiModels({})).toEqual(["gemini-flash-lite-latest", "gemini-3.8-flash"]);
    expect(geminiModels({ GEMINI_MODEL: "gemini-3.6-flash" })).toEqual(["gemini-3.6-flash"]);
    expect(geminiModels({ GEMINI_MODELS: "gemini-a, models/gemini-b ,../evil?x" })).toEqual(["gemini-a", "gemini-b"]);
    expect(defaultLLM({ GEMINI_API_KEY: KEY })).toBeInstanceOf(FallbackLLM);
    expect(vendorOf(defaultLLM({ GEMINI_API_KEY: KEY }))).toBe("gemini");
  });

  it("adds Groq and Mistral after Gemini when their keys are set, and is off with no key", () => {
    const chain = defaultLLM({ GEMINI_API_KEY: KEY, GROQ_API_KEY: "gsk_x", MISTRAL_API_KEY: "m" }) as InstanceType<typeof FallbackLLM>;
    expect(chain.available()).toEqual(["gemini:gemini-flash-lite-latest", "gemini:gemini-3.8-flash", "groq", "mistral"]);
    expect(defaultLLM({}).enabled).toBe(false);
  });

  it("uses a single service directly", () => {
    expect(defaultLLM({ GROQ_API_KEY: "gsk_x" })).toBeInstanceOf(OpenAICompatLLM);
  });
});

describe("a service that ran out of quota stays skipped on the next request", () => {
  it("shares what is resting between chains", async () => {
    const spent = fake(quota(60_000));
    const entries = [{ name: "shared-a", llm: spent }, { name: "shared-b", llm: fake(ok("b")) }];
    await call(new FallbackLLM(entries));
    await call(new FallbackLLM(entries));
    expect(spent.calls).toBe(1);
  });
});
