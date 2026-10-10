import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { DISCIPLINE_LABELS, UNIVERSITY_LABELS } from "@/lib/domain";
import { checkNote, type NoteFacts } from "./index";

export const NOTE_MODEL = "claude-opus-5-5";

/** Claude rewrites are optional: they only run when the server has an API key. */
export function aiNotesEnabled(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

const SYSTEM = `You write LinkedIn connection-request notes for a student who is growing a professional network in engineering and computer science.

Rewrite the draft so it sounds natural, warm and specific to this person, using only the facts provided. The note goes to someone the student has never met.

- Stay within the character limit you're given.
- Don't claim or imply that they have met, spoken or worked together.
- Don't mention jobs, internships, hiring, referrals or opportunities.
- Don't invent clubs, projects, companies, courses or people. The candidate notes are the student's private notes; use a detail from them only when it is clearly a shared interest or activity.
- No links, hashtags, emojis or exclamation marks.

Reply with the note text only.`;

export type RewriteResult = { ok: true; text: string } | { ok: false; reason: string };

export async function rewriteNoteWithClaude(facts: NoteFacts, draft: string, limit: number): Promise<RewriteResult> {
  if (!aiNotesEnabled()) return { ok: false, reason: "Claude suggestions aren't configured on this server." };
  const client = new Anthropic();

  const known = {
    name: facts.fullName,
    their_school: facts.university ? UNIVERSITY_LABELS[facts.university] : null,
    their_program: facts.programText ?? (facts.discipline ? DISCIPLINE_LABELS[facts.discipline] : null),
    private_notes_about_them: facts.candidateNotes,
    my_school: facts.me.school,
    my_program: facts.me.program,
    my_interests: facts.me.interests,
  };

  try {
    const response = await client.beta.messages.create({
      model: NOTE_MODEL,
      max_tokens: 2000,
      // A short rewrite is a simple task; low effort keeps it fast and cheap.
      output_config: { effort: "low" },
      // If the model declines for a policy reason, the API retries on a fallback model.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: SYSTEM,
      messages: [
        {
          role: "user",
          content: `Character limit: ${limit}\n\nFacts (JSON):\n${JSON.stringify(known, null, 2)}\n\nDraft:\n${draft}`,
        },
      ],
    });

    if (response.stop_reason === "refusal") return { ok: false, reason: "Claude declined this one; the template suggestion is still there." };
    const text = response.content
      .flatMap((b) => (b.type === "text" ? [b.text] : []))
      .join("")
      .trim()
      .replace(/^["“]|["”]$/g, "");

    const check = checkNote(text, facts, limit);
    if (!check.ok) return { ok: false, reason: `The suggestion was discarded because it ${check.reason}.` };
    return { ok: true, text };
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) return { ok: false, reason: "Claude is busy right now. Try again in a minute." };
    if (e instanceof Anthropic.AuthenticationError) return { ok: false, reason: "The server's Anthropic API key was rejected." };
    if (e instanceof Anthropic.APIError) return { ok: false, reason: `Claude returned an error (${e.status ?? "network"}).` };
    return { ok: false, reason: "Couldn't reach Claude." };
  }
}
