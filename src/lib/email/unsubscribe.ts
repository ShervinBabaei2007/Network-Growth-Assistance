import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Signed unsubscribe links: anyone holding the link can turn off the emails it names
 * (one search's digest, or all email), without signing in, and nothing else.
 */

export type UnsubscribeScope = { userId: string; searchId: string | null };

const b64 = (b: Buffer | string) => Buffer.from(b).toString("base64url");
const sign = (body: string, secret: string) => createHmac("sha256", secret).update(body).digest();

/** Valid for a year: old digests keep working long after they were sent. */
export function unsubscribeToken(scope: UnsubscribeScope, secret: string, now = Date.now()): string {
  const body = b64(JSON.stringify({ u: scope.userId, s: scope.searchId, e: Math.floor(now / 1000) + 365 * 86_400 }));
  return `${body}.${b64(sign(body, secret))}`;
}

export function readUnsubscribeToken(token: string, secret: string, now = Date.now()): UnsubscribeScope | null {
  const [body, mac] = token.split(".");
  if (!body || !mac) return null;
  const expected = sign(body, secret);
  const given = Buffer.from(mac, "base64url");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  try {
    const v = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as { u?: unknown; s?: unknown; e?: unknown };
    if (typeof v.u !== "string" || (v.s !== null && typeof v.s !== "string") || typeof v.e !== "number" || v.e * 1000 < now) return null;
    return { userId: v.u, searchId: v.s };
  } catch {
    return null;
  }
}
