// Text embeddings with Supabase's built-in gte-small model (384 dimensions), for
// matching resume lines to job requirements by meaning. Runs inside Supabase's Edge
// Runtime at no extra cost beyond the function's CPU time. Only the app's server may
// call it: it must send the shared secret in x-embed-secret.

declare const Supabase: { ai: { Session: new (model: string) => { run(input: string, opts: { mean_pool: boolean; normalize: boolean }): Promise<ArrayLike<number>> } } };

const session = new Supabase.ai.Session("gte-small");
const MAX_TEXTS = 64;
const MAX_CHARS = 2000;

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });
  const secret = Deno.env.get("EMBED_SECRET");
  if (!secret || !sameSecret(req.headers.get("x-embed-secret") ?? "", secret)) return new Response("Unauthorized", { status: 401 });

  const body = await req.json().catch(() => null);
  const texts = body?.texts;
  if (!Array.isArray(texts) || texts.length === 0 || texts.length > MAX_TEXTS || texts.some((t) => typeof t !== "string")) {
    return Response.json({ error: `Send { texts: string[] } with 1–${MAX_TEXTS} items.` }, { status: 400 });
  }

  const vectors: number[][] = [];
  for (const text of texts as string[]) {
    const output = await session.run(text.slice(0, MAX_CHARS) || " ", { mean_pool: true, normalize: true });
    vectors.push(Array.from(output));
  }
  return Response.json({ vectors });
});

/** Compares in constant time, so response timing doesn't reveal how much of the secret matched. */
function sameSecret(given: string, expected: string): boolean {
  const a = new TextEncoder().encode(given);
  const b = new TextEncoder().encode(expected);
  let diff = a.length ^ b.length;
  for (let i = 0; i < b.length; i++) diff |= (a[i] ?? 0) ^ b[i];
  return diff === 0;
}
