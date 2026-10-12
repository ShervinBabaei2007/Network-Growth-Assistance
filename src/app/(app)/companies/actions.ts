"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { err, ok, type ActionResult } from "@/lib/action-result";
import { getUserLLM } from "@/lib/ai";
import { companyKey, pairKey } from "@/lib/companies/match";
import { rewriteReferralAsk, suggestReferralAsk } from "@/lib/discovery/referral";
import { actionContext, logActivity } from "@/lib/server/action-context";

/**
 * Network ↔ jobs: the user's decisions about which company names are the same employer,
 * referrals they record, and referral-ask drafts. Nothing here contacts anyone.
 */

const uuid = z.uuid();
const name = z.string().trim().min(1).max(300);

/** "Is X the same company as Y?" The answer is the user's, and can be changed. */
export async function decideCompanies(a: string, b: string, decision: "same" | "different"): Promise<ActionResult> {
  if (!name.safeParse(a).success || !name.safeParse(b).success || !["same", "different"].includes(decision)) return err("Unknown companies.");
  const [x, y] = pairKey(companyKey(a), companyKey(b));
  if (!x || !y || x === y) return err("Those are already the same name.");
  const ctx = await actionContext();
  const { error } = await ctx.supabase.from("company_aliases").upsert({ user_id: ctx.userId, a_key: x, b_key: y, decision }, { onConflict: "user_id,a_key,b_key" });
  if (error) return err("Couldn't save that. Try again.");
  refresh();
  return ok(decision === "same" ? "Treated as the same company." : "Kept as different companies.");
}

export async function forgetCompanyDecision(a: string, b: string): Promise<ActionResult> {
  if (!name.safeParse(a).success || !name.safeParse(b).success) return err("Unknown companies.");
  const [x, y] = pairKey(companyKey(a), companyKey(b));
  const ctx = await actionContext();
  const { error } = await ctx.supabase.from("company_aliases").delete().eq("a_key", x).eq("b_key", y);
  if (error) return err("Couldn't undo. Try again.");
  refresh();
  return ok("Undone.");
}

type ReferralKind = "referral_asked" | "referral_given";

export async function recordReferral(personId: string, applicationId: string | null, kind: ReferralKind): Promise<ActionResult> {
  if (!uuid.safeParse(personId).success || (applicationId !== null && !uuid.safeParse(applicationId).success) || !["referral_asked", "referral_given"].includes(kind)) return err("Unknown person.");
  const ctx = await actionContext();
  const { data: added, error } = await ctx.supabase.rpc("record_referral", { p_person: personId, p_application: applicationId as string, p_kind: kind });
  if (error) return err(error.code === "23503" ? "That person or application isn't yours." : "Couldn't record it. Try again.");
  await logActivity(ctx, `people.${kind}`, { person: personId, application: applicationId ?? undefined });
  refresh();
  if (!added) return ok("Already recorded.");
  return ok(kind === "referral_asked" ? "Recorded that you asked for a referral." : "Recorded the referral.");
}

export async function undoReferral(personId: string, applicationId: string | null, kind: ReferralKind): Promise<ActionResult> {
  if (!uuid.safeParse(personId).success || (applicationId !== null && !uuid.safeParse(applicationId).success)) return err("Unknown person.");
  const ctx = await actionContext();
  const { error } = await ctx.supabase.rpc("undo_referral", { p_person: personId, p_application: applicationId as string, p_kind: kind });
  if (error) return err("Couldn't undo. Try again.");
  refresh();
  return ok("Undone.");
}

/**
 * A message to ask about a role and a referral: the template, or (if asked and available)
 * an AI rewrite checked against what's known. Never sent by the app.
 */
export async function draftReferralAsk(personId: string, applicationId: string, useAi: boolean): Promise<ActionResult<{ text: string; source: "template" | "ai" }>> {
  if (!uuid.safeParse(personId).success || !uuid.safeParse(applicationId).success) return err("Unknown person.");
  const ctx = await actionContext();
  const [{ data: person }, { data: app }, { data: me }, { count: contact }] = await Promise.all([
    ctx.supabase.from("network_people").select("full_name").eq("id", personId).maybeSingle(),
    ctx.supabase.from("applications").select("title, company").eq("id", applicationId).maybeSingle(),
    ctx.supabase.from("settings").select("my_school_text, my_program_text").eq("user_id", ctx.userId).single(),
    ctx.supabase.from("network_interactions").select("id", { count: "exact", head: true }).eq("person_id", personId).in("kind", ["replied", "marked_sent", "follow_up"]),
  ]);
  if (!person || !app) return err("Unknown person or application.");
  if (!app.company) return err("This application has no company name to mention.");
  const facts = { fullName: person.full_name, company: app.company, jobTitle: app.title, priorContact: (contact ?? 0) > 0, me: { school: me?.my_school_text ?? null, program: me?.my_program_text ?? null } };
  const draft = suggestReferralAsk(facts);
  if (!useAi) return ok("Template ready. Edit it before you send it yourself.", { data: { text: draft, source: "template" } });
  const ai = await getUserLLM(ctx.supabase, ctx.userId);
  if (!ai.ok) return ok(ai.reason, { data: { text: draft, source: "template" } });
  if (!(await ai.charge())) return ok("Today's free AI uses are used up. Here's the template.", { data: { text: draft, source: "template" } });
  const res = await rewriteReferralAsk(ai.llm, facts, draft);
  if (!res.ok) return ok(res.reason, { data: { text: draft, source: "template" } });
  return ok("AI version ready. Check it before you send it yourself.", { data: { text: res.text, source: "ai" } });
}
