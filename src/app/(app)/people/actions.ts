"use server";

import { loadCatalog } from "@/lib/data/catalog";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { ActionResult } from "@/lib/action-result";
import { classifyCandidate } from "@/lib/classify";
import { rescoreSearch } from "@/lib/discovery/agent";
import { NetworkingCriteria } from "@/lib/discovery/criteria";
import { identitySignature } from "@/lib/discovery/known-match";
import { getUserLLM } from "@/lib/ai";
import { rewriteIntro, suggestIntro, INTRO_LIMIT } from "@/lib/discovery/messages";
import { loadPersonDetail } from "@/lib/discovery/results";
import { startSearch } from "@/lib/discovery/service";
import { failed, firstIssue, type FormState } from "@/lib/form-state";
import { normalizeProfileUrl } from "@/lib/linkedin/normalize-url";
import { CONNECTED_PATCH, PERSON_STATUSES, savesPerson, statusInteractionKind } from "@/lib/people/crm";
import { actionContext, type ActionContext } from "@/lib/server/action-context";
import { done, fail, mutate, toFormState, verbatim } from "@/lib/server/mutation";
import type { Database } from "@/lib/supabase/database.types";

type Enums = Database["public"]["Enums"];
const uuid = z.uuid();

async function interaction(ctx: ActionContext, personId: string, kind: string, body: string | null = null) {
  await ctx.supabase.from("network_interactions").insert({ user_id: ctx.userId, person_id: personId, kind, body });
}

/** Re-scores every search this person appears in, so tiers reflect the user's correction. */
async function rescoreFor(ctx: ActionContext, personId: string) {
  const { data } = await ctx.supabase.from("network_search_people").select("search_id, network_searches(criteria)").eq("person_id", personId).limit(10);
  for (const row of data ?? []) {
    const criteria = NetworkingCriteria.safeParse(row.network_searches?.criteria);
    if (criteria.success) await rescoreSearch(ctx.supabase, ctx.userId, row.search_id, criteria.data, [personId]);
  }
}

// ------------------------------------------------------------ CRM status

export async function savePerson(personId: string): Promise<ActionResult> {
  return mutate({ ids: [personId], notFound: "mutation.personNotFound" }, async ({ ctx }) => {
    const { data, error } = await ctx.supabase.from("network_people").update({ saved: true }).eq("id", personId).select("crm_status").single();
    if (error) return fail("ui.saveFailed");
    if (data.crm_status === "discovered") await setStatusInternal(ctx, personId, "shortlisted");
    return done("personAction.saved", { log: ["network.person_saved", { person: personId }] });
  });
}

async function setStatusInternal(ctx: ActionContext, personId: string, status: Enums["network_person_status"]) {
  const { error } = await ctx.supabase.from("network_people").update({ crm_status: status, saved: savesPerson(status) }).eq("id", personId);
  if (error) return false;
  await interaction(ctx, personId, statusInteractionKind(status), status);
  return true;
}

export async function setPersonStatus(personId: string, status: string): Promise<ActionResult> {
  return mutate({ ids: [personId], notFound: "mutation.unknownStatus" }, async ({ ctx }) => {
    const s = z.enum(PERSON_STATUSES).safeParse(status);
    if (!s.success) return fail("mutation.unknownStatus");
    if (!(await setStatusInternal(ctx, personId, s.data))) return fail("mutation.updateFailed");
    // "Connected" in the CRM is the user's own statement, so the person counts as a known connection.
    if (s.data === "connected") await ctx.supabase.from("network_people").update(CONNECTED_PATCH).eq("id", personId);
    return done();
  });
}

// --------------------------------------------------------------- feedback

const FEEDBACK = ["great_match", "not_relevant", "already_connected", "wrong_person", "wrong_program"] as const;

export async function givePersonFeedback(personId: string, kind: string, searchId?: string | null): Promise<ActionResult> {
  return mutate({ ids: [personId], notFound: "personAction.feedbackNotFound" }, async ({ ctx }) => {
    const k = z.enum(FEEDBACK).safeParse(kind);
    if (!k.success) return fail("personAction.feedbackNotFound");
    const { error } = await ctx.supabase
      .from("network_feedback")
      .upsert({ user_id: ctx.userId, person_id: personId, kind: k.data, search_id: searchId && uuid.safeParse(searchId).success ? searchId : null }, { onConflict: "user_id,person_id,kind", ignoreDuplicates: true });
    if (error) return fail("personAction.feedbackFailed");

    if (k.data === "not_relevant" || k.data === "wrong_person") await setStatusInternal(ctx, personId, "not_relevant");
    if (k.data === "already_connected") await markSamePerson(ctx, personId, null, true);
    await rescoreFor(ctx, personId);
    return done("personAction.feedbackThanks", { log: ["network.feedback", { person: personId, kind: k.data }] });
  });
}

export async function undoPersonFeedback(personId: string, kind: string): Promise<ActionResult> {
  return mutate({ ids: [personId], notFound: "personAction.feedbackNotFound" }, async ({ ctx }) => {
    const k = z.enum(FEEDBACK).safeParse(kind);
    if (!k.success) return fail("personAction.feedbackNotFound");
    await ctx.supabase.from("network_feedback").delete().eq("person_id", personId).eq("kind", k.data);
    if (k.data === "not_relevant" || k.data === "wrong_person") await ctx.supabase.from("network_people").update({ crm_status: "discovered" }).eq("id", personId).eq("crm_status", "not_relevant");
    await rescoreFor(ctx, personId);
    return done();
  });
}

// ------------------------------------------------- known connection review

async function markSamePerson(ctx: ActionContext, personId: string, knownId: string | null, same: boolean) {
  const { data: p } = await ctx.supabase.from("network_people").select("full_name, linkedin_key, current_company, known_connection_id, proximity").eq("id", personId).single();
  if (!p) return;
  const known = knownId ?? p.known_connection_id;
  await ctx.supabase
    .from("network_connection_overrides")
    .upsert(
      { user_id: ctx.userId, identity_signature: identitySignature({ fullName: p.full_name, linkedinKey: p.linkedin_key, currentCompany: p.current_company }), known_connection_id: known, same_person: same },
      { onConflict: "user_id,identity_signature,known_connection_id" },
    );
  const manual = p.proximity === "manual_second" || p.proximity === "manual_third";
  await ctx.supabase
    .from("network_people")
    .update(
      same
        ? { known_match_state: "confirmed_same", proximity: "connected", known_connection_id: known }
        : { known_match_state: "confirmed_different", proximity: manual ? p.proximity : "not_connected", known_connection_id: null, known_match_confidence: null },
    )
    .eq("id", personId);
}

/** The user's answer to "is this one of your connections?" It's stored and reused by later searches. */
export async function resolveKnownMatch(personId: string, same: boolean): Promise<ActionResult> {
  return mutate({ ids: [personId], notFound: "mutation.personNotFound" }, async ({ ctx }) => {
    await markSamePerson(ctx, personId, null, same);
    await rescoreFor(ctx, personId);
    return done(same ? "personAction.markedSame" : "personAction.markedDifferent", { log: ["network.known_match_resolved", { person: personId, same }] });
  });
}

/** 2nd / 3rd degree is only ever what the user saw on LinkedIn themselves. */
export async function setProximity(personId: string, proximity: string): Promise<ActionResult> {
  return mutate({ ids: [personId], notFound: "mutation.unknownValue" }, async ({ ctx }) => {
    const p = z.enum(["manual_second", "manual_third", "unknown"]).safeParse(proximity);
    if (!p.success) return fail("mutation.unknownValue");
    const { data: row } = await ctx.supabase.from("network_people").select("known_match_state").eq("id", personId).single();
    const value = p.data === "unknown" ? (row?.known_match_state === "confirmed_different" ? "not_connected" : "unknown") : p.data;
    const { error } = await ctx.supabase.from("network_people").update({ proximity: value }).eq("id", personId);
    if (error) return fail("mutation.updateFailed");
    await interaction(ctx, personId, "proximity", value);
    return done();
  });
}

// ------------------------------------------------------------ notes, tags

const crmSchema = z.object({
  id: z.uuid(),
  notes: z.string().max(5000).transform((s) => s.trim() || null),
  tags: z.string().max(500).transform((s) => [...new Set(s.split(",").map((t) => t.trim()).filter(Boolean))].slice(0, 20).map((t) => t.slice(0, 40))),
  category: z.string().max(60).transform((s) => s.trim() || null),
  reminder: z.union([z.literal(""), z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Reminder must be a date.")]).transform((s) => s || null),
  linkedinUrl: z.string().max(500).transform((s) => s.trim() || null),
});

export async function updatePersonCrm(_: FormState, formData: FormData): Promise<FormState> {
  const parsed = crmSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return failed(firstIssue(parsed.error));
  const d = parsed.data;
  const url = d.linkedinUrl ? normalizeProfileUrl(d.linkedinUrl) : null;
  if (url && !url.ok) return failed(url.reason);
  return toFormState(
    await mutate({}, async ({ ctx }) => {
      const { error } = await ctx.supabase
        .from("network_people")
        .update({
          notes: d.notes,
          tags: d.tags,
          category: d.category,
          reminder_at: d.reminder,
          saved: true,
          ...(url?.ok ? { linkedin_url: url.url, linkedin_key: url.key } : d.linkedinUrl === null ? { linkedin_url: null, linkedin_key: null } : {}),
        })
        .eq("id", d.id);
      return error ? fail("ui.saveFailed") : done();
    }),
  );
}

export async function logPersonInteraction(_: FormState, formData: FormData): Promise<FormState> {
  const parsed = z
    .object({ id: z.uuid(), kind: z.enum(["note", "replied", "follow_up"]), body: z.string().trim().min(1, "Write something first.").max(2000), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal("")) })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) return failed(firstIssue(parsed.error));
  return toFormState(
    await mutate({}, async ({ ctx }) => {
      const { error } = await ctx.supabase.from("network_interactions").insert({
        user_id: ctx.userId,
        person_id: parsed.data.id,
        kind: parsed.data.kind,
        body: parsed.data.body,
        occurred_at: parsed.data.date ? new Date(`${parsed.data.date}T12:00:00`).toISOString() : new Date().toISOString(),
      });
      return error ? fail("ui.saveFailed") : done("personAction.historyAdded");
    }),
  );
}

/** Records clicks the user made themselves (opening LinkedIn, copying a message). Nothing is sent anywhere. */
export async function recordPersonEvent(personId: string, kind: "linkedin_opened" | "message_copied"): Promise<void> {
  await mutate({ ids: [personId], refresh: false }, async ({ ctx }) => {
    if (!["linkedin_opened", "message_copied"].includes(kind)) return fail("mutation.unknownValue");
    await interaction(ctx, personId, kind);
    return done();
  });
}

// ---------------------------------------------------------------- messages

/** A suggested intro built from verified facts; optionally polished by AI. Never sent by the app. */
export async function generateIntro(personId: string, useAi: boolean): Promise<ActionResult<{ text: string }>> {
  return mutate<{ text: string }>({ ids: [personId], notFound: "mutation.personNotFound", refresh: false }, async ({ ctx }) => {
    const detail = await loadPersonDetail(ctx.supabase, personId);
    if (!detail) return fail("mutation.personNotFound");
    const draft = suggestIntro(detail.introFacts, INTRO_LIMIT);
    if (!useAi) return done(undefined, { data: { text: draft } });
    // The user's own key, or the server's within the daily allowance (charged before the call).
    const ai = await getUserLLM(ctx.supabase, ctx.userId);
    if (!ai.ok) return done(verbatim(ai.reason), { data: { text: draft } });
    if (!(await ai.charge())) return done("personAction.aiUsedUp", { data: { text: draft } });
    const res = await rewriteIntro(ai.llm, detail.introFacts, draft, INTRO_LIMIT);
    if (!res.ok) return done(verbatim(res.reason), { data: { text: draft } });
    return done(undefined, { data: { text: res.text } });
  });
}

// -------------------------------------------------------- send to outreach

/**
 * Adds the person to Candidates (and so the Daily Queue) once their LinkedIn
 * profile link is known. School and program come from verified evidence only.
 */
export async function sendToCandidates(personId: string): Promise<ActionResult> {
  return mutate({ ids: [personId], notFound: "mutation.personNotFound" }, async ({ ctx }) => {
    const detail = await loadPersonDetail(ctx.supabase, personId);
    if (!detail) return fail("mutation.personNotFound");
    const p = detail.person;
    if (!p.linkedin_url) return fail("personAction.needLinkedIn");
    const url = normalizeProfileUrl(p.linkedin_url);
    if (!url.ok) return fail(verbatim(url.reason));

    const { data: existing } = await ctx.supabase.from("candidates").select("id").eq("profile_key", url.key).maybeSingle();
    let candidateId = existing?.id ?? null;
    if (!candidateId) {
      const school = detail.introFacts.institution;
      const program = detail.introFacts.program;
      const c = classifyCandidate(school, program, await loadCatalog(ctx.supabase));
      const classified = c.university.confidence === "confirmed" && c.discipline.confidence === "confirmed";
      const { data, error } = await ctx.supabase
        .from("candidates")
        .insert({
          user_id: ctx.userId,
          full_name: p.full_name,
          profile_url: url.url,
          profile_key: url.key,
          raw_school_text: school,
          raw_program_text: program,
          role: [detail.introFacts.role, detail.introFacts.company].filter(Boolean).join(" at ") || null,
          university: c.university.value,
          discipline: c.discipline.value,
          university_confidence: c.university.confidence,
          discipline_confidence: c.discipline.confidence,
          source: "manual",
          status: ctx.settings.auto_approve && classified ? "approved" : "awaiting_review",
          notes: p.notes,
        })
        .select("id")
        .single();
      if (error || !data) return fail("personAction.candidateAddFailed");
      candidateId = data.id;
    }
    await ctx.supabase.from("network_people").update({ candidate_id: candidateId, saved: true }).eq("id", personId);
    if (p.crm_status === "discovered" || p.crm_status === "shortlisted") await setStatusInternal(ctx, personId, "ready_to_connect");
    return done(existing ? "personAction.alreadyCandidate" : "personAction.addedCandidate", { log: ["network.sent_to_candidates", { person: personId, candidate: candidateId }] });
  });
}

// ---------------------------------------------------------------- searches

/** Runs the same criteria again as a new search (new public results, same rules). */
export async function runSearchAgain(formData: FormData): Promise<void> {
  const id = uuid.safeParse(formData.get("id"));
  if (!id.success) return;
  const ctx = await actionContext();
  const { data: s } = await ctx.supabase.from("network_searches").select("id, original_query, criteria").eq("id", id.data).single();
  if (!s) return;
  const criteria = NetworkingCriteria.safeParse(s.criteria);
  const started = await startSearch(ctx.supabase, ctx.userId, { query: s.original_query, criteria: criteria.success ? criteria.data : null, parentSearchId: s.id });
  if (started.ok) redirect(`/discover/${started.id}`);
  redirect(`/discover?error=${encodeURIComponent(started.error)}`);
}

export async function deleteSearch(formData: FormData): Promise<void> {
  await mutate({ ids: [formData.get("id")] }, async ({ ctx, ids: [id] }) => {
    // People found by the search stay in People; only the search and its links go.
    await ctx.supabase.from("network_searches").delete().eq("id", id!);
    return done();
  });
}

export async function saveNetworkingGoal(_: FormState, formData: FormData): Promise<FormState> {
  const goal = z.string().max(300, "Keep it under 300 characters.").safeParse(String(formData.get("goal") ?? "").trim());
  if (!goal.success) return failed(firstIssue(goal.error));
  return toFormState(
    await mutate({}, async ({ ctx }) => {
      const { error } = await ctx.supabase.from("settings").update({ networking_goal: goal.data || null }).eq("user_id", ctx.userId);
      return error ? fail("ui.saveFailed") : done();
    }),
  );
}

/** Saves the LinkedIn profile link the user found themselves (e.g. via "Find on LinkedIn"). */
export async function saveLinkedInUrl(_: FormState, formData: FormData): Promise<FormState> {
  return toFormState(
    await mutate({ ids: [formData.get("id")], notFound: "mutation.personNotFound" }, async ({ ctx, ids: [id] }) => {
      const url = normalizeProfileUrl(String(formData.get("linkedinUrl") ?? ""));
      if (!url.ok) return fail(verbatim(url.reason));
      const { data: p } = await ctx.supabase.from("network_people").select("identity_keys").eq("id", id!).single();
      if (!p) return fail("mutation.personNotFound");
      const { error } = await ctx.supabase
        .from("network_people")
        .update({ linkedin_url: url.url, linkedin_key: url.key, identity_keys: [...new Set([...p.identity_keys.filter((k) => !k.startsWith("linkedin:")), `linkedin:${url.key}`])] })
        .eq("id", id!);
      return error ? fail("ui.saveFailed") : done("personAction.linkSaved");
    }),
  );
}
