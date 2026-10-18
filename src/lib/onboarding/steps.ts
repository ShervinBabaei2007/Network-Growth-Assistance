/**
 * Onboarding without Zod: the types and plain helpers the browser needs (welcome, tour, checklist, menu).
 * The schemas that validate what is stored live in ./state.ts and stay on the server, so this file keeps
 * Zod out of the JavaScript every page downloads.
 */

export const GOALS = ["network", "jobs", "both"] as const;
export type Goal = (typeof GOALS)[number];

export const STATUSES = ["new", "in_progress", "skipped", "done"] as const;
export type OnboardingStatus = (typeof STATUSES)[number];

export const WIZARD_STEPS = 4;

export type OnboardingState = {
  status: OnboardingStatus;
  step: number;
  goal?: Goal;
  tourDone: boolean;
  tourStep: number;
  checklistDismissed: boolean;
};

/** The welcome appears only for people who have neither finished nor skipped it. */
export function shouldShowWizard(state: OnboardingState): boolean {
  return state.status === "new" || state.status === "in_progress";
}

export function skip(state: OnboardingState): OnboardingState {
  return { ...state, status: "skipped" };
}

export function finish(state: OnboardingState): OnboardingState {
  return { ...state, status: "done" };
}

/** Reopening from Help or Settings starts from the first step and brings the checklist back. */
export function restart(state: OnboardingState): OnboardingState {
  return { ...state, status: "in_progress", step: 0, tourDone: false, tourStep: 0, checklistDismissed: false };
}

export function goToStep(state: OnboardingState, step: number): OnboardingState {
  const clamped = Math.max(0, Math.min(WIZARD_STEPS - 1, step));
  return { ...state, status: "in_progress", step: clamped };
}

/** Where the last wizard step sends someone, by what they said they want to do. */
export function firstActionFor(goal: Goal | undefined): { href: string; label: string; why: string } {
  if (goal === "jobs") {
    return { href: "/jobs/resume", label: "Add your resume", why: "Job matches are scored against your resume, so this is the quickest way to see real results." };
  }
  if (goal === "network") {
    return { href: "/discover", label: "Search for people", why: "Describe who you'd like to meet and the app looks for real, verifiable matches." };
  }
  return { href: "/discover", label: "Search for people", why: "Describe who you'd like to meet and the app looks for real, verifiable matches. Jobs are one click away in the menu." };
}

export type ChecklistFacts = {
  hasPlan: boolean;
  hasBaseline: boolean;
  hasCandidates: boolean;
  hasSearch: boolean;
  hasResume: boolean;
  hasJobActivity: boolean;
};

export type ChecklistItem = { id: string; label: string; href: string; done: boolean };

/** Derived from real records every time, never stored, so it can't drift from what the user has done. */
export function buildChecklist(goal: Goal | undefined, facts: ChecklistFacts): ChecklistItem[] {
  const network: ChecklistItem[] = [
    { id: "plan", label: "Set your schools, disciplines and goal", href: "/settings#plan", done: facts.hasPlan },
    { id: "baseline", label: "Record your starting connection count", href: "/overview#starting-point", done: facts.hasBaseline },
    { id: "discover", label: "Run your first people search", href: "/discover", done: facts.hasSearch },
    { id: "candidate", label: "Add your first candidate", href: "/candidates", done: facts.hasCandidates },
  ];
  const jobs: ChecklistItem[] = [
    { id: "resume", label: "Add your resume", href: "/jobs/resume", done: facts.hasResume },
    { id: "job", label: "Save a job or track an application", href: "/jobs", done: facts.hasJobActivity },
  ];
  if (goal === "jobs") return jobs;
  if (goal === "network") return network;
  return [...network, ...jobs];
}

export function checklistComplete(items: ChecklistItem[]): boolean {
  return items.length > 0 && items.every((i) => i.done);
}
