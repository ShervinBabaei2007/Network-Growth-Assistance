import { GTE_SMALL_THRESHOLDS, type Thresholds } from "./match";

/**
 * Meaning-based matching uses Supabase's free built-in embedding model (gte-small,
 * 384 dimensions) through the `embed` Edge Function. It's optional: without it, fit
 * checks use the skills taxonomy alone.
 */

export interface Embedder {
  readonly enabled: boolean;
  /** Similarity at or above which a resume line meets (or partly meets) a requirement. */
  readonly thresholds: Thresholds;
  /** One vector per text, or null if the service failed (callers fall back). */
  embed(texts: string[]): Promise<number[][] | null>;
}

// About 55 ms of CPU per text: 16 per call stays well under the Edge Function's per-request CPU limit.
const BATCH = 16;
const PARALLEL = 4;

export class EdgeEmbedder implements Embedder {
  readonly enabled = true;
  readonly thresholds = GTE_SMALL_THRESHOLDS;
  constructor(
    private readonly url: string,
    private readonly secret: string,
    private readonly apiKey: string,
  ) {}

  private async batch(texts: string[]): Promise<number[][] | null> {
    try {
      const res = await fetch(this.url, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-embed-secret": this.secret, apikey: this.apiKey },
        body: JSON.stringify({ texts }),
        signal: AbortSignal.timeout(20_000),
        cache: "no-store",
      });
      if (!res.ok) return null;
      const body = (await res.json()) as { vectors?: number[][] };
      return Array.isArray(body.vectors) && body.vectors.length === texts.length ? body.vectors : null;
    } catch {
      return null;
    }
  }

  async embed(texts: string[]): Promise<number[][] | null> {
    const batches: string[][] = [];
    for (let i = 0; i < texts.length; i += BATCH) batches.push(texts.slice(i, i + BATCH));
    const out: number[][][] = [];
    for (let i = 0; i < batches.length; i += PARALLEL) {
      const results = await Promise.all(batches.slice(i, i + PARALLEL).map((b) => this.batch(b)));
      if (results.some((r) => r === null)) return null;
      out.push(...(results as number[][][]));
    }
    return out.flat();
  }
}

export const disabledEmbedder: Embedder = { enabled: false, thresholds: GTE_SMALL_THRESHOLDS, embed: async () => null };

/** pgvector's text form: "[0.1,0.2,…]". */
export const toVector = (v: number[]) => `[${v.map((x) => (Number.isFinite(x) ? x.toFixed(6) : "0")).join(",")}]`;
