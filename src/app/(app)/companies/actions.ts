"use server";

import { z } from "zod";
import type { ActionResult } from "@/lib/action-result";
import { getUserLLM } from "@/lib/ai";
import { companyKey, pairKey } from "@/lib/companies/match";
import { rewriteReferralAsk, suggestReferralAsk } from "@/lib/discovery/referral";
import { done, fail, mutate, verbatim } from "@/lib/server/mutation";

/**
 * Network ↔ jobs: the user's decisions about which company names are the same employer,
 * referrals they record, and referral-ask drafts. Nothing here contacts anyone.
 */

const name = z.string().trim().min(1).max(300);
const companiesNotFound = "companyAction.companiesNotFound";

/** "Is X the same company as Y?" The answer is the user's, and can be changed. */
export async function decideCompanies(a: string, b: string, decision: "same" | "different"): Promise<ActionResult> {
  return mutate({}, async ({ ctx }) => {
    if (!name.safeParse(a).success || !name.safeParse(b).success || !["same", "different"].includes(decision)) return fail(companiesNotFound);
    const [x, y] = pairKey(companyKey(a), companyKey(b));
    if (!x || !y || x === y) return fail("companyAction.sameName");
    const { error } = await ctx.supabase.from("company_aliases").upsert({ user_id: ctx.userId, a_key: x, b_key: y, decision }, { onConflict: "user_id,a_key,b_key" });
    if (error) return fail("companyAction.saveFailed");
    return done(decision === "same" ? "companyAction.treatedSame" : "companyAction.keptDifferent");
  });
}

export async function forgetCompanyDecision(a: string, b: string): Promise<ActionResult> {
  return mutate({}, async ({ ctx }) => {
    if (!name.safeParse(a).success || !name.safeParse(b).success) return fail(companiesNotFound);
    const [x, y] = pairKey(companyKey(a), companyKey(b));
    const { error } = await ctx.supabase.from("company_aliases").delete().eq("a_key", x).eq("b_key", y);
    if (error) return fail("mutation.undoFailed");
    return done("mutation.undone");
  });
}

type ReferralKind = "referral_asked" | "referral_given";
const isReferralKind = (kind: string) => ["referral_asked", "referral_given"].includes(kind);

export async function recordReferral(personId: string, applicationId: string | null, kind: ReferralKind): Promise<ActionResult> {
  return mutate({ ids: applicationId === null ? [personId] : [personId, applicationId], notFound: "mutation.personNotFound" }, async ({ ctx }) => {
    if (!isReferralKind(kind)) return fail("mutation.personNotFound");
    const { data: added, error } = await ctx.supabase.rpc("record_referral", { p_person: personId, p_application: applicationId as string, p_kind: kind });
    if (error) return fail("companyAction.recordFailed", { error, byCode: { "23503": "companyAction.notYours" } });
    const log: [string, { person: string; application?: string }] = [`people.${kind}`, { person: personId, application: applicationId ?? undefined }];
    if (!added) return done("companyAction.alreadyRecorded", { log });
    return done(kind === "referral_asked" ? "companyAction.recordedAsked" : "companyAction.recordedGiven", { log });
  });
}

export async function undoReferral(personId: string, applicationId: string | null, kind: ReferralKind): Promise<ActionResult> {
  return mutate({ ids: applicationId === null ? [personId] : [personId, applicationId], notFound: "mutation.personNotFound" }, async ({ ctx }) => {
    const { error } = await ctx.supabase.rpc("undo_referral", { p_person: personId, p_application: applicationId as string, p_kind: kind });
    if (error) return fail("mutation.undoFailed");
    return done("mutation.undone");
  });
}

/**
 * A message to ask about a role and a referral: the template, or (if asked and available)
 * an AI rewrite checked against what's known. Never sent by the app.
 */
export async function draftReferralAsk(personId: string, applicationId: string, useAi: boolean): Promise<ActionResult<{ text: string; source: "template" | "ai" }>> {
  return mutate<{ text: string; source: "template" | "ai" }>({ ids: [personId, applicationId], notFound: "mutation.personNotFound", refresh: false }, async ({ ctx }) => {
    const [{ data: person }, { data: app }, { data: me }, { count: contact }] = await Promise.all([
      ctx.supabase.from("network_people").select("full_name").eq("id", personId).maybeSingle(),
      ctx.supabase.from("applications").select("title, company").eq("id", applicationId).maybeSingle(),
      ctx.supabase.from("settings").select("my_school_text, my_program_text").eq("user_id", ctx.userId).single(),
      ctx.supabase.from("network_interactions").select("id", { count: "exact", head: true }).eq("person_id", personId).in("kind", ["replied", "marked_sent", "follow_up"]),
    ]);
    if (!person || !app) return fail("companyAction.personOrAppNotFound");
    if (!app.company) return fail("companyAction.noCompanyName");
    const facts = { fullName: person.full_name, company: app.company, jobTitle: app.title, priorContact: (contact ?? 0) > 0, me: { school: me?.my_school_text ?? null, program: me?.my_program_text ?? null } };
    const draft = suggestReferralAsk(facts);
    const template = { text: draft, source: "template" as const };
    if (!useAi) return done("companyAction.templateReady", { data: template });
    const ai = await getUserLLM(ctx.supabase, ctx.userId);
    if (!ai.ok) return done(verbatim(ai.reason), { data: template });
    if (!(await ai.charge())) return done("companyAction.aiUsedUpTemplate", { data: template });
    const res = await rewriteReferralAsk(ai.llm, facts, draft);
    if (!res.ok) return done(verbatim(res.reason), { data: template });
    return done("companyAction.aiReady", { data: { text: res.text, source: "ai" } });
  });
}
