import { disciplineName, targetUniversities } from "@/lib/domain";
import type { Progress } from "./index";

export type NextAction = {
  kind:
    | "paused"
    | "set-up"
    | "set-baseline"
    | "classify-accepted"
    | "find-candidates"
    | "review-candidates"
    | "send-invitations"
    | "goal-met";
  title: string;
  detail: string;
  href: string;
  /** What the button says: a descriptive label, never a bare "Go". */
  cta: string;
};

/** The single most useful thing to do now, so it is clear without navigating around. */
export function nextAction(progress: Progress, paused: boolean): NextAction {
  const { overall, focus } = progress;

  if (paused) {
    return {
      kind: "paused",
      title: "Review the LinkedIn warning before doing anything else",
      detail: "Outreach is paused. Resume it in Settings once your account is in good standing.",
      href: "/settings",
      cta: "Open Settings",
    };
  }
  if (!progress.catalog.disciplines.length || !progress.catalog.universities.length || overall.target === null) {
    return {
      kind: "set-up",
      title: "Set up your networking plan",
      detail: "Add the schools and disciplines you want to connect with, and your connection goal. Nothing is assumed until you do.",
      href: "/settings#plan",
      cta: "Set up my plan",
    };
  }
  if (overall.baseline === null) {
    return {
      kind: "set-baseline",
      title: "Record your starting connection count",
      detail: "Growth toward the overall target is measured from this number.",
      href: "/overview#starting-point",
      cta: "Record my starting count",
    };
  }
  if (overall.acceptedNeedsClassification > 0) {
    return {
      kind: "classify-accepted",
      title: `Confirm the school and program for ${overall.acceptedNeedsClassification} accepted connection${overall.acceptedNeedsClassification === 1 ? "" : "s"}`,
      detail: "They don't count toward any target until both are confirmed.",
      href: "/candidates?status=connected&review=1",
      cta: "Confirm these connections",
    };
  }
  if (!focus) {
    return {
      kind: "goal-met",
      title: "Every discipline target is met",
      detail: "Raise targets in Settings if you want to keep growing.",
      href: "/settings",
      cta: "Raise my targets",
    };
  }

  const name = disciplineName(progress.catalog, focus.discipline);
  const schools = targetUniversities(progress.catalog).map((u) => u.name);
  const where = schools.length ? ` at ${schools.length > 2 ? `${schools.slice(0, 2).join(", ")} and others` : schools.join(" and ")}` : "";
  if (overall.readyForOutreach > 0) {
    return {
      kind: "send-invitations",
      title: `Send invitations, starting with ${name}`,
      detail: `${overall.readyForOutreach} approved candidate${overall.readyForOutreach === 1 ? " is" : "s are"} ready.`,
      href: "/queue",
      cta: "Open the queue",
    };
  }
  if (overall.awaitingReview > 0) {
    return {
      kind: "review-candidates",
      title: `Review ${overall.awaitingReview} candidate${overall.awaitingReview === 1 ? "" : "s"}`,
      detail: "Approve the ones who fit before they can be queued.",
      href: "/candidates?status=awaiting_review",
      cta: "Review candidates",
    };
  }
  return {
    kind: "find-candidates",
    title: `Find ${name} candidates${where}`,
    detail: `${focus.remaining} accepted connections still needed in ${name}. Add profiles you find through LinkedIn search.`,
    href: "/candidates",
    cta: "Add candidates",
  };
}
