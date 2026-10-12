/**
 * Structured server logs (one JSON line each) for cron jobs and background work. Fields
 * carry ids, counts and short error messages only: never resume or posting text, names,
 * emails or keys. Messages pass through redact() in case an upstream error quotes a secret.
 */

type Fields = Record<string, string | number | boolean | null | undefined>;
type Level = "info" | "warn" | "error";

const SECRETS: [RegExp, string][] = [
  [/AIza[0-9A-Za-z_-]{20,}/g, "[gemini-key]"],
  [/sk-ant-[0-9A-Za-z_-]{10,}/g, "[anthropic-key]"],
  [/\bBearer\s+[0-9A-Za-z._~+/=-]{8,}/gi, "Bearer [redacted]"],
  [/\beyJ[0-9A-Za-z_-]{8,}\.[0-9A-Za-z_-]{8,}\.[0-9A-Za-z_-]{8,}/g, "[jwt]"],
  [/\b(sb_secret|sb_publishable)_[0-9A-Za-z_-]{8,}/g, "[supabase-key]"],
  [/([?&](?:key|api_key|app_key|token)=)[^&\s]+/gi, "$1[redacted]"],
  [/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, "[email]"],
];

export function redact(text: string): string {
  return SECRETS.reduce((s, [re, to]) => s.replace(re, to), text).slice(0, 500);
}

/** A short, redacted message for any thrown value. */
export const errorMessage = (e: unknown) => redact(e instanceof Error ? e.message : String(e));

export function log(level: Level, scope: string, event: string, fields: Fields = {}) {
  if (process.env.NODE_ENV === "test" || process.env.VITEST) return;
  const safe = Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, typeof v === "string" ? redact(v) : v]));
  const line = JSON.stringify({ at: new Date().toISOString(), level, scope, event, ...safe });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.info(line);
}
