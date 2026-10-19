import "server-only";
import type { LLMProvider, LlmFailKind, LlmResult, LlmTier, LlmUsage } from "@/lib/discovery/llm";
import type { z } from "zod";

/** One service in the chain. `prefer` lists the kinds of work it is best used for, so cheap models take bulk reading. */
export type ChainEntry = { name: string; llm: LLMProvider & { usage?: LlmUsage }; prefer?: LlmTier[] };

const DAY_MS = 24 * 3_600_000;
const BUSY_COOLDOWN_MS = 20_000;

/**
 * Which services are resting and until when. Shared by every chain in this server process: each request builds its own chain,
 * and a service that ran out of quota for one request must stay skipped for the next.
 */
const SHARED_COOLDOWNS = new Map<string, number>();

/** Milliseconds until the next 00:00 UTC, when most free quotas reset. */
export const untilUtcMidnight = (now: number) => DAY_MS - (now % DAY_MS);

/**
 * Several free model services behind one. A call goes to the first service that is not cooling down; when a service
 * runs out of free quota it is skipped until its quota resets, and when it is busy or slow the next one is tried at once.
 * Each service has its own free quota, so together they cover far more than any one. If all of them fail, the last
 * failure is returned and the caller uses its non-AI path.
 */
export class FallbackLLM implements LLMProvider {
  readonly enabled: boolean;
  constructor(
    private readonly entries: ChainEntry[],
    private readonly now: () => number = Date.now,
    private readonly coolUntil: Map<string, number> = SHARED_COOLDOWNS,
  ) {
    this.enabled = entries.some((e) => e.llm.enabled);
  }

  /** Total calls and tokens across the chain, for budgets and the search's "AI calls" figure. */
  get usage(): LlmUsage {
    return this.entries.reduce<LlmUsage>(
      (sum, e) => ({ calls: sum.calls + (e.llm.usage?.calls ?? 0), inputTokens: sum.inputTokens + (e.llm.usage?.inputTokens ?? 0), outputTokens: sum.outputTokens + (e.llm.usage?.outputTokens ?? 0) }),
      { calls: 0, inputTokens: 0, outputTokens: 0 },
    );
  }

  /** The first service that is switched on, for labels (which vendor the server uses). */
  first(): LLMProvider | null {
    return this.entries.find((e) => e.llm.enabled)?.llm ?? null;
  }

  /** Names of the services that can take a call now. */
  available(): string[] {
    return this.entries.filter((e) => e.llm.enabled && (this.coolUntil.get(e.name) ?? 0) <= this.now()).map((e) => e.name);
  }

  private order(tier: LlmTier): ChainEntry[] {
    const t = this.now();
    const ready = this.entries.filter((e) => e.llm.enabled && (this.coolUntil.get(e.name) ?? 0) <= t);
    return [...ready.filter((e) => e.prefer?.includes(tier)), ...ready.filter((e) => !e.prefer?.includes(tier))];
  }

  async structured<S extends z.ZodType>(opts: { tier: LlmTier; system: string; user: string; schema: S; maxTokens?: number }): Promise<LlmResult<z.infer<S>>> {
    let last: LlmResult<z.infer<S>> = { ok: false, reason: "AI is busy right now.", kind: "quota" };
    for (const entry of this.order(opts.tier)) {
      const res = await entry.llm.structured(opts);
      if (res.ok) return res;
      last = res;
      const kind: LlmFailKind = res.kind ?? "other";
      if (kind === "quota") this.coolUntil.set(entry.name, this.now() + Math.min(DAY_MS, res.retryAfterMs ?? untilUtcMidnight(this.now())));
      else if (kind === "busy" || kind === "timeout") this.coolUntil.set(entry.name, this.now() + BUSY_COOLDOWN_MS);
      // "other" (a bad answer, a refusal) is about this request, not the service: the next service may do better.
    }
    return last;
  }
}
