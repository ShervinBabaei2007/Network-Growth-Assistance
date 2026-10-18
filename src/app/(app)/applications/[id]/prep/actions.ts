"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { err, ok, type ActionResult } from "@/lib/action-result";
import { actionContext } from "@/lib/server/action-context";

const uuid = z.uuid();

/**
 * Saves the pack as it is now and notes it on the application's timeline. The pack is sent back from the page, so it
 * is checked here: it must be a modest-sized object, and it only ever lands on the signed-in user's own application.
 */
export async function savePrepSnapshot(applicationId: string, pack: unknown): Promise<ActionResult> {
  if (!uuid.safeParse(applicationId).success) return err("Unknown application.");
  const parsed = z.object({ heading: z.string().max(300) }).passthrough().safeParse(pack);
  if (!parsed.success || JSON.stringify(pack).length > 150_000) return err("Couldn't save that prep pack.");
  const ctx = await actionContext();
  const { error } = await ctx.supabase.from("interview_preps").insert({ application_id: applicationId, content: parsed.data as never });
  if (error) return err("Couldn't save the prep pack. Try again.");
  await ctx.supabase.from("application_events").insert({ application_id: applicationId, kind: "document", detail: "Saved an interview prep pack." });
  refresh();
  return ok("Saved to the timeline.");
}
