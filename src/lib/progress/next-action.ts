import { disciplineName, targetUniversities } from "@/lib/domain";
import { translator, type Translator } from "@/lib/i18n";
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

/** The single most useful thing to do now, so it is clear without navigating around. Text is in the language of `t`. */
export function nextAction(progress: Progress, paused: boolean, t: Translator = translator("en")): NextAction {
  const { overall, focus } = progress;

  if (paused) {
    return { kind: "paused", title: t("nextAction.pausedTitle"), detail: t("nextAction.pausedDetail"), href: "/settings", cta: t("nextAction.pausedCta") };
  }
  if (!progress.catalog.disciplines.length || !progress.catalog.universities.length || overall.target === null) {
    return { kind: "set-up", title: t("nextAction.setUpTitle"), detail: t("nextAction.setUpDetail"), href: "/settings#plan", cta: t("nextAction.setUpCta") };
  }
  if (overall.baseline === null) {
    return { kind: "set-baseline", title: t("nextAction.baselineTitle"), detail: t("nextAction.baselineDetail"), href: "/overview#starting-point", cta: t("nextAction.baselineCta") };
  }
  if (overall.acceptedNeedsClassification > 0) {
    const n = overall.acceptedNeedsClassification;
    return {
      kind: "classify-accepted",
      title: n === 1 ? t("nextAction.classifyOne") : t("nextAction.classifyMany", { count: n }),
      detail: t("nextAction.classifyDetail"),
      href: "/candidates?status=connected&review=1",
      cta: t("nextAction.classifyCta"),
    };
  }
  if (!focus) {
    return { kind: "goal-met", title: t("nextAction.goalMetTitle"), detail: t("nextAction.goalMetDetail"), href: "/settings", cta: t("nextAction.goalMetCta") };
  }

  const name = disciplineName(progress.catalog, focus.discipline);
  const schools = targetUniversities(progress.catalog).map((u) => u.name);
  const where = !schools.length
    ? ""
    : schools.length > 2
      ? t("nextAction.whereOthers", { schools: schools.slice(0, 2).join(", ") })
      : t("nextAction.whereTwo", { schools: schools.join(` ${t("nextAction.and")} `) });
  if (overall.readyForOutreach > 0) {
    const n = overall.readyForOutreach;
    return {
      kind: "send-invitations",
      title: t("nextAction.sendTitle", { name }),
      detail: n === 1 ? t("nextAction.sendDetailOne") : t("nextAction.sendDetailMany", { count: n }),
      href: "/queue",
      cta: t("nextAction.sendCta"),
    };
  }
  if (overall.awaitingReview > 0) {
    const n = overall.awaitingReview;
    return {
      kind: "review-candidates",
      title: n === 1 ? t("nextAction.reviewOne") : t("nextAction.reviewMany", { count: n }),
      detail: t("nextAction.reviewDetail"),
      href: "/candidates?status=awaiting_review",
      cta: t("nextAction.reviewCta"),
    };
  }
  return {
    kind: "find-candidates",
    title: t("nextAction.findTitle", { name, where }),
    detail: t("nextAction.findDetail", { remaining: focus.remaining, name }),
    href: "/candidates",
    cta: t("nextAction.findCta"),
  };
}
