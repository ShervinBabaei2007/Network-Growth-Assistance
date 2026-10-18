// DEFAULT_RULES: no links, no hype, no mutual-connection claims, no asks for a referral.
import { BANNED as DEFAULT_RULES, checkGrounded, type BannedPhrase } from "@/lib/discovery/grounding";
import { firstName } from "@/lib/notes";
import { unknownNumbers } from "@/lib/text/terms";

/**
 * The follow-up touches after someone accepts an invitation, and a draft message for each. Drafts are built
 * from a template using only what the record holds (the person's name and, if known, their school and field),
 * never claim a conversation that did not happen, and are copied by the user, who sends them. Nothing here
 * calls an AI service, so a draft cannot contain an invented fact.
 */

export const FOLLOW_UP_KINDS = ["thank_you", "coffee_chat", "check_in_30", "check_in_90"] as const;
export type FollowUpKind = (typeof FOLLOW_UP_KINDS)[number];

export const FOLLOW_UP_LABELS: Record<FollowUpKind, { title: string; when: string }> = {
  thank_you: { title: "Thank them for connecting", when: "the day they accept" },
  coffee_chat: { title: "Ask for a short chat", when: "a week after" },
  check_in_30: { title: "Check in", when: "30 days after" },
  check_in_90: { title: "Catch up", when: "90 days after" },
};

export const FOLLOW_UP_LIMIT = 400;

export type FollowUpFacts = {
  fullName: string;
  /** Their school, as the user named it in their own list. */
  school: string | null;
  /** Their field, as the user named it in their own list. */
  program: string | null;
};

export function draftFollowUp(kind: FollowUpKind, f: FollowUpFacts): string {
  const name = firstName(f.fullName);
  const hi = name ? `Hi ${name}` : "Hi";
  const field = f.program ? ` in ${f.program}` : "";
  const start = f.program && f.school ? ` how you got started${field} after ${f.school}` : f.program ? ` how you got started${field}` : " how you got started in your work";
  switch (kind) {
    case "thank_you":
      return `${hi}, thank you for accepting my invitation to connect. I'm glad to be in touch.`;
    case "coffee_chat":
      return `${hi}, thanks for connecting. If you have 15 minutes in the coming weeks, I'd love to hear${start}. No pressure at all, and thank you either way.`;
    case "check_in_30":
      return `${hi}, it has been a few weeks since we connected and I wanted to say hello. I hope things are going well${field}. If there is anything I can help with, I'm happy to.`;
    case "check_in_90":
      return `${hi}, I hope you're well. It has been a few months since we connected, and I'd enjoy catching up when you have a moment. Is there anything new in your work lately?`;
  }
}

const NO_FALSE_HISTORY: BannedPhrase[] = [
  { pattern: /\bthanks again\b|\blast time\b|\bwhen we (last )?(spoke|talked|met)\b/i, reason: "implies a past conversation" },
];

/** Whether a draft (or the user's edit of one) sticks to what the record knows. */
export function checkFollowUpDraft(text: string, f: FollowUpFacts): { ok: true } | { ok: false; reason: string } {
  const known = [f.fullName, f.school, f.program];
  const grounded = checkGrounded(text, known, FOLLOW_UP_LIMIT, [...NO_FALSE_HISTORY, ...DEFAULT_RULES]);
  if (!grounded.ok) return grounded;
  const numbers = unknownNumbers(text, known.filter(Boolean).join(" "));
  // "15 minutes" is part of the template, not a claim about the person.
  const claimed = numbers.filter((n) => n !== "15");
  if (claimed.length) return { ok: false, reason: `mentions “${claimed[0]}”, which isn't in what we know` };
  return { ok: true };
}

/** The state of a suggestion as the page shows it. */
export type DueState = "overdue" | "today" | "soon" | "later";

/** Where a due date sits relative to today (both as YYYY-MM-DD in the user's time zone). */
export function dueState(dueOn: string, today: string): DueState {
  if (dueOn < today) return "overdue";
  if (dueOn === today) return "today";
  const days = (Date.parse(dueOn) - Date.parse(today)) / 86_400_000;
  return days <= 7 ? "soon" : "later";
}

/** Due on or before today. */
export const isDue = (dueOn: string, today: string) => dueOn <= today;
