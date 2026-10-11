import { createHash } from "node:crypto";
import { clean } from "@/lib/text/match";

/** The feed shows only postings from the last 24 hours. */
export const FRESH_HOURS = 24;
const HOUR = 60 * 60_000;
/** Clock skew we tolerate for a posting time slightly in the future. */
const FUTURE_SLACK_MS = 10 * 60_000;

/** Whether a posting time is within the last 24 hours. A missing or unreadable time is never fresh. */
export function isFresh(postedAt: string | null, now = Date.now()): boolean {
  if (!postedAt) return false;
  const t = Date.parse(postedAt);
  if (Number.isNaN(t)) return false;
  return t <= now + FUTURE_SLACK_MS && now - t <= FRESH_HOURS * HOUR;
}

export const freshSince = (now = Date.now()) => new Date(now - FRESH_HOURS * HOUR).toISOString();

/** Strips "(Remote)", "- Vancouver" and similar so the same job pasted twice gets one key. */
export function normalizeTitle(title: string): string {
  return clean(title.replace(/\([^)]*\)|\[[^\]]*\]/g, " ").replace(/\s[-–—|]\s.*$/, " ")).trim();
}

/** A stable key for a pasted posting: company, title and place. */
export function dedupeKey(p: { title: string; company: string | null; city: string | null; province: string | null; remote: boolean }): string {
  const place = clean(p.city).trim() || p.province || (p.remote ? "remote" : "");
  const basis = `${clean(p.company).trim()}|${normalizeTitle(p.title)}|${place}`;
  return createHash("sha256").update(basis).digest("hex").slice(0, 40);
}
