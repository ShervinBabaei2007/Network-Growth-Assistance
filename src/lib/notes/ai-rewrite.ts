import "server-only";
import { z } from "zod";
import { defaultLLM } from "@/lib/ai/default-llm";
import type { LLMProvider } from "@/lib/discovery/llm";
import { DISCIPLINE_LABELS, UNIVERSITY_LABELS } from "@/lib/domain";
import { checkNote, type NoteFacts } from "./index";

/** AI rewrites are optional: they only run when the server has a model key (GEMINI_API_KEY by default). */
export function aiNotesEnabled(llm: LLMProvider = defaultLLM()): boolean {
  return llm.enabled;
}

const SYSTEM = `You write LinkedIn connection-request notes for a student who is growing a professional network in engineering and computer science.

Rewrite the draft so it sounds natural, warm and specific to this person, using only the facts provided. The note goes to someone the student has never met.

- Stay within the character limit you're given.
- Don't claim or imply that they have met, spoken or worked together.
- Don't mention jobs, internships, hiring, referrals or opportunities.
- Don't invent clubs, projects, companies, courses or people. The candidate notes are the student's private notes; use a detail from them only when it is clearly a shared interest or activity.
- No links, hashtags, emojis or exclamation marks.

Put the note text, and nothing else, in "note".`;

const NoteOut = z.object({ note: z.string() });

export type RewriteResult = { ok: true; text: string } | { ok: false; reason: string };

/** A more natural version of the template note, checked by the same rules as a hand-written one. */
/** `llm` comes from getUserLLM, after its charge: never the server key directly. */
export async function rewriteNoteWithAI(facts: NoteFacts, draft: string, limit: number, llm: LLMProvider): Promise<RewriteResult> {
  if (!llm.enabled) return { ok: false, reason: "AI suggestions aren't configured on this server." };

  const known = {
    name: facts.fullName,
    their_school: facts.university ? UNIVERSITY_LABELS[facts.university] : null,
    their_program: facts.programText ?? (facts.discipline ? DISCIPLINE_LABELS[facts.discipline] : null),
    private_notes_about_them: facts.candidateNotes,
    my_school: facts.me.school,
    my_program: facts.me.program,
    my_interests: facts.me.interests,
  };

  const res = await llm.structured({
    tier: "smart",
    system: SYSTEM,
    user: `Character limit: ${limit}\n\nFacts (JSON):\n${JSON.stringify(known, null, 2)}\n\nDraft:\n${draft}`,
    schema: NoteOut,
    maxTokens: 2000,
  });
  if (!res.ok) return { ok: false, reason: `${res.reason} The template suggestion is still there.` };
  const text = res.data.note.trim().replace(/^["“]|["”]$/g, "");
  const check = checkNote(text, facts, limit);
  if (!check.ok) return { ok: false, reason: `The suggestion was discarded because it ${check.reason}.` };
  return { ok: true, text };
}
