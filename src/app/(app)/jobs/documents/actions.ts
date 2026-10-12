"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { err, ok, type ActionResult } from "@/lib/action-result";
import { CoverLetterDoc, TailoredResumeDoc } from "@/lib/job-postings/documents";
import { resumeText } from "@/lib/job-postings/resume";
import { ResumeProfile } from "@/lib/job-postings/types";
import { actionContext, logActivity } from "@/lib/server/action-context";
import type { Json } from "@/lib/supabase/database.types";
import { unknownNumbers, unknownTerms } from "@/lib/text/terms";
import { toastSpec } from "@/lib/toast";

/**
 * Edits to generated documents (tailored resumes, CVs and cover letters). Each generated
 * version is its own row: editing changes only that version, and deleting is undoable for
 * a week. The user's resume itself is never touched here.
 */

const uuid = z.uuid();
const asJson = (v: unknown) => v as NonNullable<Json>;

/** What an edited resume says that the resume doesn't: a warning, never a block (it's the user's own writing). */
function unsupported(doc: TailoredResumeDoc, known: string): string[] {
  const texts = [doc.summary ?? "", ...doc.skills, ...doc.sections.flatMap((s) => s.entries.flatMap((e) => e.bullets.map((b) => b.text)))];
  const found = new Set<string>();
  for (const t of texts) for (const x of [...unknownTerms(t, known), ...unknownNumbers(t, known)]) found.add(x);
  return [...found];
}

export async function saveDocumentEdit(docId: string, content: unknown): Promise<ActionResult> {
  if (!uuid.safeParse(docId).success) return err("Unknown document.");
  const ctx = await actionContext();
  const { data: doc } = await ctx.supabase.from("tailored_documents").select("kind, resume_id").eq("id", docId).is("deleted_at", null).maybeSingle();
  if (!doc) return err("Unknown document.");
  const parsed = doc.kind === "cover_letter" ? CoverLetterDoc.safeParse(content) : TailoredResumeDoc.safeParse(content);
  if (!parsed.success) return err("Something in the edit is too long or empty. Check it and try again.");
  const { error } = await ctx.supabase.from("tailored_documents").update({ edited: asJson(parsed.data) }).eq("id", docId);
  if (error) return err("Couldn't save your edits. Try again.");
  refresh();

  if (doc.kind !== "cover_letter" && doc.resume_id) {
    const { data: resume } = await ctx.supabase.from("resumes").select("profile, raw_text").eq("id", doc.resume_id).maybeSingle();
    const profile = ResumeProfile.safeParse(resume?.profile);
    if (resume && profile.success) {
      const extra = unsupported(parsed.data as TailoredResumeDoc, resumeText(profile.data, resume.raw_text));
      if (extra.length) {
        return ok("Saved your edits.", {
          toast: toastSpec("warning", "Saved your edits.", `Your edits mention ${extra.slice(0, 3).map((x) => `“${x}”`).join(", ")}, which your resume doesn't. Keep them only if they're true.`),
        });
      }
    }
  }
  return ok("Saved your edits.");
}

export async function discardDocumentEdit(docId: string): Promise<ActionResult> {
  if (!uuid.safeParse(docId).success) return err("Unknown document.");
  const ctx = await actionContext();
  const { error } = await ctx.supabase.from("tailored_documents").update({ edited: null }).eq("id", docId);
  if (error) return err("Couldn't reset. Try again.");
  refresh();
  return ok("Changes reverted to the generated version.");
}

/** Deletes a generated version. It's kept for a week so Undo works, then purged. */
export async function deleteDocument(docId: string): Promise<ActionResult> {
  if (!uuid.safeParse(docId).success) return err("Unknown document.");
  const ctx = await actionContext();
  const { error } = await ctx.supabase.from("tailored_documents").update({ deleted_at: new Date().toISOString() }).eq("id", docId);
  if (error) return err("Couldn't delete it. Try again.");
  await logActivity(ctx, "jobs.document_deleted", { document: docId });
  refresh();
  return ok("Version deleted.");
}

export async function restoreDocument(docId: string): Promise<ActionResult> {
  if (!uuid.safeParse(docId).success) return err("Unknown document.");
  const ctx = await actionContext();
  const { error } = await ctx.supabase.from("tailored_documents").update({ deleted_at: null }).eq("id", docId);
  if (error) return err("Couldn't restore it. Try again.");
  refresh();
  return ok("Version restored.");
}
