/**
 * The operator's storage and AI-use report: how full the database is against the plan's limit, and when to say so.
 * Pure so it can be tested; the daily job and the ops route use it.
 */

export const DEFAULT_DB_LIMIT_MB = 500;
export const WARN_AT = 0.7;
export const CRITICAL_AT = 0.9;

export type StorageUsage = {
  database_bytes: number;
  tables: { name: string; rows: number; bytes: number }[];
  jobs: number;
  jobs_shortened: number;
  requirements: number;
  requirement_vectors: number;
  ai_calls_today: number;
  ai_calls_30_days: number;
};

export type StorageLevel = "ok" | "warning" | "critical";
export type StorageStatus = { usedMb: number; limitMb: number; share: number; level: StorageLevel };

const MB = 1024 * 1024;

export function storageStatus(usage: Pick<StorageUsage, "database_bytes">, limitMb: number = DEFAULT_DB_LIMIT_MB): StorageStatus {
  const share = usage.database_bytes / (limitMb * MB);
  return { usedMb: Math.round(usage.database_bytes / MB), limitMb, share, level: share >= CRITICAL_AT ? "critical" : share >= WARN_AT ? "warning" : "ok" };
}

/** The notification to send for this status, or null while usage is below the warning level. The key repeats monthly, so it is not sent every day. */
export function storageAlert(status: StorageStatus, now: Date): { title: string; body: string; dedupe: string } | null {
  if (status.level === "ok") return null;
  const pct = Math.round(status.share * 100);
  return {
    title: status.level === "critical" ? `Database is ${pct}% full` : `Database is ${pct}% of its limit`,
    body: `${status.usedMb} MB of ${status.limitMb} MB used. Shortening old postings and dropping unused vectors runs daily; if this keeps rising, remove unused countries from searches or upgrade the plan.`,
    dedupe: `storage:${status.level}:${now.toISOString().slice(0, 7)}`,
  };
}
