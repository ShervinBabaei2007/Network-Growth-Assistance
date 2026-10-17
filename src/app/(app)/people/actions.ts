"use server";

import { refresh } from "next/cache";
import { loadCatalog } from "@/lib/data/catalog";
import { redirect } from "next/navigation";
import { z } from "zod";
import { classifyCandidate } from "@/lib/classify";
import { rescoreSearch } from "@/lib/discovery/agent";
import { NetworkingCriteria } from "@/lib/discovery/criteria";
import { identitySignature } from "@/lib/discovery/known-match";
import { getUserLLM } from "@/lib/ai";
import { rewriteIntro, suggestIntro, INTRO_LIMIT } from "@/lib/discovery/messages";
import { loadPersonDetail } from "@/lib/discovery/results";
import { startSearch } from "@/lib/discovery/service";
import { failed, firstIssue, saved, type FormState } from "@/lib/form-state";
import { normalizeProfileUrl } from "@/lib/linkedin/normalize-url";
import { actionContext, logActivity, type ActionContext } from "@/lib/server/action-context";
import type { Database } from "@/lib/supabase/database.types";

type Enums = Database["public"]["Enums"];
export type ActionResult = { ok: true; message?: string; text?: string } | { ok: false; error: string };

const uuid = z.uuid();
const ok = (message?: string): ActionResult => ({ ok: true, message });
const err = (error: string): ActionResult => ({ ok: false, error });

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
  if (!uuid.safeParse(personId).success) return err("Unknown person.");
  const ctx = await actionContext();
  const { data, error } = await ctx.supabase.from("network_people").update({ saved: true }).eq("id", personId).select("crm_status").single();
  if (error) return err("Couldn't save. Try again.");
  if (data.crm_status === "discovered") await setStatusInternal(ctx, personId, "shortlisted");
  await logActivity(ctx, "network.person_saved", { person: personId });
  refresh();
  return ok("Saved to People.");
}

async function setStatusInternal(ctx: ActionContext, personId: string, status: Enums["network_person_status"]) {
  const { error } = await ctx.supabase.from("network_people").update({ crm_status: status, saved: status !== "not_relevant" ? true : undefined }).eq("id", personId);
  if (error) return false;
  await interaction(ctx, personId, status === "connection_sent_manually" ? "marked_sent" : status === "replied" ? "replied" : "status_change", status);
  return true;
}

const STATUSES = ["discovered", "shortlisted", "ready_to_connect", "connection_sent_manually", "connected", "replied", "follow_up", "archived", "not_relevant"] as const;

export async function setPersonStatus(personId: string, status: string): Promise<ActionResult> {
  const s = z.enum(STATUSES).safeParse(status);
  if (!uuid.safeParse(personId).success || !s.success) return err("Unknown status.");
  const ctx = await actionContext();
  if (!(await setStatusInternal(ctx, personId, s.data))) return err("Couldn't update. Try again.");
  // "Connected" in the CRM is the user's own statement, so the person counts as a known connection.
  if (s.data === "connected") await ctx.supabase.from("network_people").update({ proximity: "connected", known_match_state: "confirmed_same" }).eq("id", personId);
  refresh();
  return ok();
}

// --------------------------------------------------------------- feedback

const FEEDBACK = ["great_match", "not_relevant", "already_connected", "wrong_person", "wrong_program"] as const;

export async function givePersonFeedback(personId: string, kind: string, searchId?: string | null): Promise<ActionResult> {
  const k = z.enum(FEEDBACK).safeParse(kind);
  if (!uuid.safeParse(personId).success || !k.success) return err("Unknown feedback.");
  const ctx = await actionContext();
  const { error } = await ctx.supabase
    .from("network_feedback")
    .upsert({ user_id: ctx.userId, person_id: personId, kind: k.data, search_id: searchId && uuid.safeParse(searchId).success ? searchId : null }, { onConflict: "user_id,person_id,kind", ignoreDuplicates: true });
  if (error) return err("Couldn't save your feedback. Try again.");

  if (k.data === "not_relevant" || k.data === "wrong_person") await setStatusInternal(ctx, personId, "not_relevant");
  if (k.data === "already_connected") await markSamePerson(ctx, personId, null, true);
  await rescoreFor(ctx, personId);
  await logActivity(ctx, "network.feedback", { person: personId, kind: k.data });
  refresh();
  return ok("Thanks. Future rankings will use this.");
}

export async function undoPersonFeedback(personId: string, kind: string): Promise<ActionResult> {
  const k = z.enum(FEEDBACK).safeParse(kind);
  if (!uuid.safeParse(personId).success || !k.success) return err("Unknown feedback.");
  const ctx = await actionContext();
  await ctx.supabase.from("network_feedback").delete().eq("person_id", personId).eq("kind", k.data);
  if (k.data === "not_relevant" || k.data === "wrong_person") await ctx.supabase.from("network_people").update({ crm_status: "discovered" }).eq("id", personId).eq("crm_status", "not_relevant");
  await rescoreFor(ctx, personId);
  refresh();
  return ok();
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
  if (!uuid.safeParse(personId).success) return err("Unknown person.");
  const ctx = await actionContext();
  await markSamePerson(ctx, personId, null, same);
  await rescoreFor(ctx, personId);
  await logActivity(ctx, "network.known_match_resolved", { person: personId, same });
  refresh();
  return ok(same ? "Marked as already connected." : "Marked as not your connection.");
}

/** 2nd / 3rd degree is only ever what the user saw on LinkedIn themselves. */
export async function setProximity(personId: string, proximity: string): Promise<ActionResult> {
  const p = z.enum(["manual_second", "manual_third", "unknown"]).safeParse(proximity);
  if (!uuid.safeParse(personId).success || !p.success) return err("Unknown value.");
  const ctx = await actionContext();
  const { data: row } = await ctx.supabase.from("network_people").select("known_match_state").eq("id", personId).single();
  const value = p.data === "unknown" ? (row?.known_match_state === "confirmed_different" ? "not_connected" : "unknown") : p.data;
  const { error } = await ctx.supabase.from("network_people").update({ proximity: value }).eq("id", personId);
  if (error) return err("Couldn't update. Try again.");
  await interaction(ctx, personId, "proximity", value);
  refresh();
  return ok();
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
  const ctx = await actionContext();
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
  if (error) return failed("Couldn't save. Try again.");
  refresh();
  return saved();
}

export async function logPersonInteraction(_: FormState, formData: FormData): Promise<FormState> {
  const parsed = z
    .object({ id: z.uuid(), kind: z.enum(["note", "replied", "follow_up"]), body: z.string().trim().min(1, "Write something first.").max(2000), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal("")) })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) return failed(firstIssue(parsed.error));
  const ctx = await actionContext();
  const { error } = await ctx.supabase.from("network_interactions").insert({
    user_id: ctx.userId,
    person_id: parsed.data.id,
    kind: parsed.data.kind,
    body: parsed.data.body,
    occurred_at: parsed.data.date ? new Date(`${parsed.data.date}T12:00:00`).toISOString() : new Date().toISOString(),
  });
  if (error) return failed("Couldn't save. Try again.");
  refresh();
  return saved("Added to history.");
}

/** Records clicks the user made themselves (opening LinkedIn, copying a message). Nothing is sent anywhere. */
export async function recordPersonEvent(personId: string, kind: "linkedin_opened" | "message_copied"): Promise<void> {
  if (!uuid.safeParse(personId).success || !["linkedin_opened", "message_copied"].includes(kind)) return;
  const ctx = await actionContext();
  await interaction(ctx, personId, kind);
}

// ---------------------------------------------------------------- messages

/** A suggested intro built from verified facts; optionally polished by AI. Never sent by the app. */
export async function generateIntro(personId: string, useAi: boolean): Promise<ActionResult> {
  if (!uuid.safeParse(personId).success) return err("Unknown person.");
  const ctx = await actionContext();
  const detail = await loadPersonDetail(ctx.supabase, personId);
  if (!detail) return err("Unknown person.");
  const draft = suggestIntro(detail.introFacts, INTRO_LIMIT);
  if (!useAi) return { ok: true, text: draft };
  // The user's own key, or the server's within the daily allowance (charged before the call).
  const ai = await getUserLLM(ctx.supabase, ctx.userId);
  if (!ai.ok) return { ok: true, text: draft, message: ai.reason };
  if (!(await ai.charge())) return { ok: true, text: draft, message: "Today's free AI uses are used up. Here's the suggested message without AI." };
  const res = await rewriteIntro(ai.llm, detail.introFacts, draft, INTRO_LIMIT);
  if (!res.ok) return { ok: true, text: draft, message: res.reason };
  return { ok: true, text: res.text };
}

// -------------------------------------------------------- send to outreach

/**
 * Adds the person to Candidates (and so the Daily Queue) once their LinkedIn
 * profile link is known. School and program come from verified evidence only.
 */
export async function sendToCandidates(personId: string): Promise<ActionResult> {
  if (!uuid.safeParse(personId).success) return err("Unknown person.");
  const ctx = await actionContext();
  const detail = await loadPersonDetail(ctx.supabase, personId);
  if (!detail) return err("Unknown person.");
  const p = detail.person;
  if (!p.linkedin_url) return err("Add their LinkedIn profile link first (open their profile yourself and paste the address).");
  const url = normalizeProfileUrl(p.linkedin_url);
  if (!url.ok) return err(url.reason);

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
    if (error || !data) return err("Couldn't add them to Candidates. Try again.");
    candidateId = data.id;
  }
  await ctx.supabase.from("network_people").update({ candidate_id: candidateId, saved: true }).eq("id", personId);
  if (p.crm_status === "discovered" || p.crm_status === "shortlisted") await setStatusInternal(ctx, personId, "ready_to_connect");
  await logActivity(ctx, "network.sent_to_candidates", { person: personId, candidate: candidateId });
  refresh();
  return ok(existing ? "Already in Candidates; linked." : "Added to Candidates.");
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
  const id = uuid.safeParse(formData.get("id"));
  if (!id.success) return;
  const ctx = await actionContext();
  // People found by the search stay in People; only the search and its links go.
  await ctx.supabase.from("network_searches").delete().eq("id", id.data);
  refresh();
}

export async function saveNetworkingGoal(_: FormState, formData: FormData): Promise<FormState> {
  const goal = z.string().max(300, "Keep it under 300 characters.").safeParse(String(formData.get("goal") ?? "").trim());
  if (!goal.success) return failed(firstIssue(goal.error));
  const ctx = await actionContext();
  const { error } = await ctx.supabase.from("settings").update({ networking_goal: goal.data || null }).eq("user_id", ctx.userId);
  if (error) return failed("Couldn't save. Try again.");
  refresh();
  return saved();
}

/** Saves the LinkedIn profile link the user found themselves (e.g. via "Find on LinkedIn"). */
export async function saveLinkedInUrl(_: FormState, formData: FormData): Promise<FormState> {
  const id = uuid.safeParse(formData.get("id"));
  if (!id.success) return failed("Unknown person.");
  const url = normalizeProfileUrl(String(formData.get("linkedinUrl") ?? ""));
  if (!url.ok) return failed(url.reason);
  const ctx = await actionContext();
  const { data: p } = await ctx.supabase.from("network_people").select("identity_keys").eq("id", id.data).single();
  if (!p) return failed("Unknown person.");
  const { error } = await ctx.supabase
    .from("network_people")
    .update({ linkedin_url: url.url, linkedin_key: url.key, identity_keys: [...new Set([...p.identity_keys.filter((k) => !k.startsWith("linkedin:")), `linkedin:${url.key}`])] })
    .eq("id", id.data);
  if (error) return failed("Couldn't save. Try again.");
  refresh();
  return saved("Saved. The LinkedIn button now opens their profile.");
}
