/**
 * An interview prep pack, built only from what the user has recorded: the posting's requirements, their resume
 * bullets, their scheduled interviews and the application itself. Rules decide which bullet fits which question;
 * nothing is generated, so nothing can claim experience the user did not write down, and every company link is
 * one that came from the saved posting. Pure, so the rules are unit-tested.
 */

export type PrepRequirement = { text: string; kind: "must" | "nice"; category: string };
export type PrepBullet = { id: string; text: string; source: string };
export type PrepInterview = { startsAt: string; timezone: string; kind: string; location: string | null; durationMinutes: number };
export type PrepInput = {
  title: string;
  company: string | null;
  stage: string;
  postingUrl: string | null;
  requirements: PrepRequirement[];
  bullets: PrepBullet[];
  interviews: PrepInterview[];
};

export type Story = { bullet: PrepBullet };
export type QuestionPrep = { question: string; why: string; stories: Story[]; empty: string };
export type PrepPack = {
  heading: string;
  topics: { category: string; items: { text: string; kind: "must" | "nice" }[] }[];
  behavioural: QuestionPrep[];
  technical: QuestionPrep[];
  askThem: string[];
  checklist: string[];
  sources: { label: string; href: string }[];
  notes: string[];
};

// ------------------------------------------------------------------ matching

const STOP = new Set(
  "the and for with that this from have has had are was were will you your our their they them its into over under about across using used use able work working experience years year strong good knowledge understanding ability skills skill team teams role candidate required preferred plus including such other more than any all new".split(" "),
);

/** Lower-case words of 4+ letters that carry meaning. A trailing "s" is dropped so "systems" matches "system". */
export function significantWords(text: string): string[] {
  const words = text.toLowerCase().match(/[a-z][a-z+#.]{2,}/g) ?? [];
  return [...new Set(words.map((w) => w.replace(/\.+$/, "").replace(/(?<=\w{3})s$/, "")).filter((w) => w.length >= 3 && !STOP.has(w)))];
}

type Theme = { question: string; why: string; words: RegExp; numbers?: boolean };

/** The questions almost every interview asks, and the words in a bullet that make it a fit. */
const THEMES: Theme[] = [
  { question: "Tell me about a time you worked in or led a team.", why: "Interviewers listen for your role, not just the team's result.", words: /\b(led|lead|leading|team|mentor|coordinat|manag|collaborat|organi[sz]|president|captain|supervis|volunteer)/i },
  { question: "Tell me about a hard problem you solved.", why: "Show how you found the cause and what you chose to do.", words: /\b(solv|debug|fix|troubleshoot|resolv|diagnos|optimi[sz]|improv|reduc|analy[sz])/i },
  { question: "Tell me about something you built or delivered.", why: "Walk through your decisions and what you would do differently.", words: /\b(built|build|develop|design|implement|launch|creat|deploy|ship|engineer|prototype|automat)/i },
  { question: "Tell me about a time you learned something quickly.", why: "Employers want to know how you handle the unfamiliar.", words: /\b(learn|research|train|self-taught|certif|course|adapt|onboard|studied)/i },
  { question: "What result are you most proud of?", why: "Lead with the outcome, then how you got there.", words: /\b(increas|reduc|sav|grew|improv|achiev|award|won|top|record|faster|%)/i, numbers: true },
  { question: "How do you handle deadlines and competing priorities?", why: "Describe how you decide what comes first.", words: /\b(deadline|prioriti|on time|schedul|multiple|several|concurrent|balanc|ahead of)/i },
];

function storiesFor(theme: Theme, bullets: PrepBullet[], used: Set<string>, max = 2): PrepBullet[] {
  const hits = bullets.filter((b) => theme.words.test(b.text) || (theme.numbers && /\d/.test(b.text)));
  // Prefer lines not already used for another question, so the story bank covers more of the resume.
  const fresh = hits.filter((b) => !used.has(b.id));
  const picked = [...fresh, ...hits.filter((b) => used.has(b.id))].slice(0, max);
  for (const b of picked) used.add(b.id);
  return picked;
}

/** The bullets that share meaningful words with a requirement, best match first. */
export function bulletsForRequirement(requirement: string, bullets: PrepBullet[], max = 2): PrepBullet[] {
  const want = significantWords(requirement);
  if (want.length === 0) return [];
  const needed = want.length >= 4 ? 2 : 1;
  return bullets
    .map((b) => {
      const have = new Set(significantWords(b.text));
      return { b, score: want.filter((w) => have.has(w)).length };
    })
    .filter((x) => x.score >= needed)
    .sort((a, c) => c.score - a.score)
    .slice(0, max)
    .map((x) => x.b);
}

// ------------------------------------------------------------------ the pack

const CATEGORY_LABEL: Record<string, string> = { skill: "Skills and tools", education: "Education", experience: "Experience", certification: "Certifications", language: "Languages", other: "Other" };
const categoryLabel = (c: string) => CATEGORY_LABEL[c] ?? c.charAt(0).toUpperCase() + c.slice(1);

export function formatInterviewTime(i: PrepInterview): string {
  const when = new Intl.DateTimeFormat("en-CA", { timeZone: i.timezone, weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" }).format(new Date(i.startsAt));
  return `${when}, ${i.durationMinutes} min, ${i.kind}${i.location ? ` (${i.location})` : ""}`;
}

export function buildPrepPack(input: PrepInput, now = new Date()): PrepPack {
  const where = input.company ? `${input.title} at ${input.company}` : input.title;
  const used = new Set<string>();

  const behavioural: QuestionPrep[] = THEMES.map((t) => ({
    question: t.question,
    why: t.why,
    stories: storiesFor(t, input.bullets, used).map((bullet) => ({ bullet })),
    empty: input.bullets.length
      ? "None of your resume lines clearly fits this. Think of an example from school, work or a project, and write it down before the interview."
      : "Add your resume to see which of your own lines fit. Until then, think of an example from school, work or a project.",
  }));

  // One technical question per requirement the posting insists on, matched to the user's own words.
  const musts = input.requirements.filter((r) => r.kind === "must").slice(0, 6);
  const technical: QuestionPrep[] = musts.map((r) => ({
    question: `Tell me about your experience with: ${r.text}`,
    why: "The posting lists this as required.",
    stories: bulletsForRequirement(r.text, input.bullets).map((bullet) => ({ bullet })),
    empty: "No line in your resume mentions this. If you have used it, be ready with a specific example; if not, say what you have done that is closest, and be honest about the gap.",
  }));

  const byCategory = new Map<string, PrepPack["topics"][number]["items"]>();
  for (const r of [...input.requirements].sort((a, b) => (a.kind === b.kind ? 0 : a.kind === "must" ? -1 : 1)).slice(0, 14)) {
    const list = byCategory.get(r.category) ?? [];
    list.push({ text: r.text, kind: r.kind });
    byCategory.set(r.category, list);
  }

  const next = input.interviews.filter((i) => Date.parse(i.startsAt) >= now.getTime()).sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt))[0];
  const checklist = [
    next ? `Confirm the time: ${formatInterviewTime(next)}.` : "Add the interview time to this application so it appears in your calendar.",
    next?.kind === "video" || next?.kind === "phone" ? "Test your microphone, camera and connection the day before. Find a quiet place." : "Plan how you will get there and how long it takes. Aim to arrive 10 minutes early.",
    "Re-read the posting and the requirements above.",
    "Choose three stories (from the list below) and say each one out loud once, in about two minutes.",
    "Choose three questions to ask them.",
    "Have your resume and a pen and paper ready.",
    "Afterwards, write down what was asked while you remember it, and send a short thank-you the same day.",
  ];

  const sources: PrepPack["sources"] = [];
  if (input.postingUrl) sources.push({ label: `The posting you saved for ${where}`, href: input.postingUrl });

  return {
    heading: `Interview prep: ${where}`,
    topics: [...byCategory.entries()].map(([category, items]) => ({ category: categoryLabel(category), items })),
    behavioural,
    technical,
    askThem: [
      `What would success look like in the first 90 days of the ${input.title} role?`,
      "How does the team work day to day, and who would I work with most?",
      "What are the biggest challenges the team is facing right now?",
      "How are people in this role supported to learn and grow?",
      "What happens next in the process, and when should I expect to hear back?",
    ],
    checklist,
    sources,
    notes: [
      "Everything above comes from your posting and your own resume. Nothing was added about the company: read its website and recent news yourself and note the source.",
      "Stories are your own resume lines, matched by simple word rules. Check each one is accurate and add the details only you know.",
    ],
  };
}

// ------------------------------------------------------------------ export

export function packToMarkdown(pack: PrepPack): string {
  const lines: string[] = [`# ${pack.heading}`, ""];
  if (pack.sources.length) lines.push("## Sources", ...pack.sources.map((s) => `- [${s.label}](${s.href})`), "");
  if (pack.topics.length) {
    lines.push("## Likely topics (from the posting)");
    for (const t of pack.topics) lines.push(`### ${t.category}`, ...t.items.map((i) => `- ${i.text}${i.kind === "must" ? " (required)" : ""}`));
    lines.push("");
  }
  const questions = (title: string, list: QuestionPrep[]) => {
    if (!list.length) return;
    lines.push(`## ${title}`);
    for (const q of list) {
      lines.push(`### ${q.question}`, `_${q.why}_`);
      if (q.stories.length) lines.push(...q.stories.map((s) => `- From your resume (${s.bullet.source}): ${s.bullet.text}`));
      else lines.push(`- ${q.empty}`);
    }
    lines.push("");
  };
  questions("Questions they are likely to ask", pack.behavioural);
  questions("Questions about the role's requirements", pack.technical);
  lines.push("## Questions to ask them", ...pack.askThem.map((q) => `- ${q}`), "", "## Checklist", ...pack.checklist.map((c) => `- [ ] ${c}`), "", "## Notes", ...pack.notes.map((n) => `- ${n}`), "");
  return lines.join("\n");
}
