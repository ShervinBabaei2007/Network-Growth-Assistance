import { z } from "zod";
import { checkGrounded } from "./grounding";
import type { LLMProvider } from "./llm";

/**
 * Optional second stage after deterministic scoring: the model compares people
 * against the user's networking goal and explains why each is worth meeting.
 * It sees only verified facts, must cite them by id, and anything it says that
 * isn't grounded in those facts is thrown away.
 */

export type RerankFact = { id: string; field: string; value: string; confidence: string };
export type RerankPerson = { id: string; name: string; relevance: number; facts: RerankFact[] };
export type RerankContext = { goal: string | null; me: { school: string | null; program: string | null; interests: string | null }; request: string };
export type RerankResult = { networkingValueScore: number; reasonForConnecting: string; conversationAngle: string; evidenceIds: string[] };

const RerankSchema = z.object({
  people: z.array(
    z.object({
      personId: z.string(),
      networkingValueScore: z.number(),
      reasonForConnecting: z.string(),
      conversationAngle: z.string(),
      evidenceIds: z.array(z.string()),
    }),
  ),
});

const SYSTEM = `You help a person decide who is most worth meeting from a list of researched professionals.

For each person, using ONLY the facts listed for them:
- networkingValueScore (0-100): how valuable a conversation would be for the user's goal. Someone a few steps ahead on the user's own path often beats a famous senior leader.
- reasonForConnecting: one or two sentences (max 220 characters) on why they're relevant to the user's goal.
- conversationAngle: one question the user could ask them (max 160 characters).
- evidenceIds: the ids of the facts your reasoning relies on.

Rules: don't invent anything (no shared interests, projects, mutual connections, seniority or dates that aren't in the facts). Don't call anyone a 2nd- or 3rd-degree connection. If the facts are thin, say less.`;

export async function rerankPeople(llm: LLMProvider, people: RerankPerson[], ctx: RerankContext): Promise<{ results: Map<string, RerankResult>; rejected: number; error?: string }> {
  const results = new Map<string, RerankResult>();
  if (!llm.enabled || people.length === 0) return { results, rejected: 0 };
  const user = JSON.stringify(
    {
      user_goal: ctx.goal,
      user_request: ctx.request,
      user_background: ctx.me,
      people: people.map((p) => ({ personId: p.id, name: p.name, relevanceScore: p.relevance, facts: p.facts })),
    },
    null,
    1,
  );
  const res = await llm.structured({ tier: "smart", system: SYSTEM, user, schema: RerankSchema, maxTokens: 12000 });
  if (!res.ok) return { results, rejected: 0, error: res.reason };
  return validateRerank(res.data.people, people, ctx);
}

/** Server-side validation of the model's output: ids must exist and the text must be grounded. */
export function validateRerank(
  output: z.infer<typeof RerankSchema>["people"],
  people: RerankPerson[],
  ctx: RerankContext,
): { results: Map<string, RerankResult>; rejected: number } {
  const byId = new Map(people.map((p) => [p.id, p]));
  const results = new Map<string, RerankResult>();
  let rejected = 0;
  for (const o of output) {
    const person = byId.get(o.personId);
    if (!person || results.has(o.personId)) {
      rejected++;
      continue;
    }
    const factIds = new Set(person.facts.map((f) => f.id));
    if (!o.evidenceIds.length || !o.evidenceIds.every((id) => factIds.has(id))) {
      rejected++;
      continue;
    }
    const known = [person.name, ...person.facts.map((f) => f.value), ctx.goal, ctx.me.school, ctx.me.program, ctx.me.interests, ctx.request];
    const reason = o.reasonForConnecting.trim();
    const angle = o.conversationAngle.trim();
    if (!checkGrounded(reason, known, 300).ok || !checkGrounded(angle, known, 220).ok) {
      rejected++;
      continue;
    }
    results.set(o.personId, {
      networkingValueScore: Math.max(0, Math.min(100, Math.round(o.networkingValueScore))),
      reasonForConnecting: reason,
      conversationAngle: angle,
      evidenceIds: o.evidenceIds,
    });
  }
  return { results, rejected };
}
