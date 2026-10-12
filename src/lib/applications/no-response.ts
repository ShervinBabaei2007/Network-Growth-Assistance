import type { Stage } from "./stages";

/**
 * Suggests marking an application "No response" when nothing has happened for a while.
 * Only a suggestion: the stage is never changed automatically.
 *
 * Waiting stages are applied and screening. Activity is the latest of the stage change
 * and any timeline event; an upcoming interview means the user is not waiting.
 */
export type WaitingApplication = {
  id: string;
  stage: Stage;
  stageChangedAt: string;
  lastEventAt: string | null;
  nextInterviewAt: string | null;
};

const WAITING: readonly Stage[] = ["applied", "screening"];
const DAY_MS = 86_400_000;

export function daysWithoutResponse(app: WaitingApplication, now: Date): number | null {
  if (!WAITING.includes(app.stage)) return null;
  if (app.nextInterviewAt && Date.parse(app.nextInterviewAt) >= now.getTime()) return null;
  const last = Math.max(Date.parse(app.stageChangedAt), app.lastEventAt ? Date.parse(app.lastEventAt) : 0);
  return Math.floor((now.getTime() - last) / DAY_MS);
}

export function suggestNoResponse<T extends WaitingApplication>(apps: T[], afterDays: number, now: Date): (T & { days: number })[] {
  return apps
    .map((a) => ({ ...a, days: daysWithoutResponse(a, now) ?? -1 }))
    .filter((a) => a.days >= afterDays)
    .sort((a, b) => b.days - a.days);
}
