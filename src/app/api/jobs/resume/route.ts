import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { getAIProvider } from "@/lib/ai";
import { DOCX_MIME, fileToText, pastedToText, type TextResult } from "@/lib/job-postings/document-text";
import { parseResume } from "@/lib/job-postings/resume";
import { fieldLabel, importSummary, parseResumeDetailed, reconcileWithAi } from "@/lib/job-postings/resume-fields";
import { saveResumeLines } from "@/lib/job-postings/service";
import { MAX_TRACKS, normalizeTrack, trackLabel, trackPattern } from "@/lib/job-postings/tracks";
import { jobServices } from "@/lib/job-postings/services";
import { logActivity } from "@/lib/server/action-context";
import { allow, LIMITS } from "@/lib/server/rate-limit";
import { routeUser, unauthorized } from "@/lib/server/route-auth";
import type { Json } from "@/lib/supabase/database.types";

// Reading a file, an optional AI read, and embedding the resume's lines.
export const maxDuration = 60;

const MAX_RESUMES = 20;
const asJson = (v: unknown) => v as NonNullable<Json>;

export type ResumeImportResponse = {
  id: string;
  filled: number;
  needsReview: { path: string; label: string }[];
  missing: { path: string; label: string; reason: string }[];
  completeness: number;
  parsedWith: "ai" | "heuristic";
  warnings: string[];
};

/**
 * Imports a resume from a PDF or DOCX file, or pasted text. Its text is kept unchanged as
 * the original, the uploaded file is stored privately so it can be downloaded again, and
 * the parsed profile records how sure we are about each field. The new resume becomes
 * the active one; earlier resumes are kept, never overwritten.
 */
export async function POST(request: Request) {
  const user = await routeUser();
  if (!user) return unauthorized();
  if (!(await allow(user.supabase, LIMITS.resumeUpload))) return NextResponse.json({ error: LIMITS.resumeUpload.message }, { status: 429 });
  const form = await request.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "We couldn't read this resume. Try another PDF or DOCX file." }, { status: 400 });
  const file = form.get("file");
  const pasted = form.get("text")?.toString() ?? "";
  if (!(file instanceof File) && !pasted.trim()) return NextResponse.json({ error: "Choose a PDF or DOCX file, or paste your resume." }, { status: 400 });

  const track = normalizeTrack(form.get("track")?.toString());
  const { data: existing } = await user.supabase.from("resumes").select("track");
  const tracks = new Set((existing ?? []).map((r) => (r.track ?? "").toLowerCase()));
  if (!tracks.has((track ?? "").toLowerCase()) && tracks.size >= MAX_TRACKS) return NextResponse.json({ error: `You can keep ${MAX_TRACKS} resume tracks. Import into an existing one, or delete a track's resumes first.` }, { status: 409 });
  if ((existing?.length ?? 0) >= MAX_RESUMES) return NextResponse.json({ error: `You can keep ${MAX_RESUMES} resumes. Delete one first.` }, { status: 409 });

  const bytes = file instanceof File ? new Uint8Array(await file.arrayBuffer()) : null;
  // Parse a copy: the PDF reader takes ownership of the buffer it's given, and the original bytes are stored below.
  const text: TextResult = bytes ? await fileToText(bytes.slice()) : pastedToText(pasted);
  if (!text.ok) return NextResponse.json({ error: text.error }, { status: 400 });

  const warnings: string[] = [];
  let parsed = parseResumeDetailed(text.text);
  let parsedWith: "ai" | "heuristic" = "heuristic";

  // Optional second read with AI. It can only confirm or add what the text says (see groundAiResume).
  if (form.get("useAi") === "on") {
    const session = await getAIProvider(user.supabase, user.userId);
    if (!session.ok) warnings.push(`Read without AI: ${session.reason}`);
    else if (!(await session.charge())) warnings.push("Read without AI: today's free AI uses are used up.");
    else {
      const ai = await parseResume(text.text, session.provider);
      if (ai.parsedWith === "ai") {
        parsed = reconcileWithAi(text.text, parsed, ai.profile);
        parsedWith = "ai";
      } else warnings.push(ai.note ?? "The AI read didn't work, so your resume was read without it.");
    }
  }

  const id = randomUUID();
  const label = (form.get("label")?.toString().trim() || (file instanceof File ? file.name.replace(/\.(pdf|docx)$/i, "") : "Pasted resume")).slice(0, 100) || "Resume";

  // The original file, kept private in the user's own folder.
  let originalPath: string | null = null;
  if (bytes && text.kind !== "paste") {
    const path = `${user.userId}/${id}.${text.kind}`;
    const { error } = await user.supabase.storage.from("resumes").upload(path, bytes.slice(), { contentType: text.kind === "pdf" ? "application/pdf" : DOCX_MIME, upsert: false });
    if (error) warnings.push("We kept your resume's text, but couldn't store the original file.");
    else originalPath = path;
  }

  // One resume is current per track; the new one takes over its track. Its situation (work authorization…) carries over,
  // and a new track starts from the main resume's situation.
  const { data: actives } = await user.supabase.from("resumes").select("facts, track").eq("is_active", true);
  const sameTrack = (t: string | null) => (t ?? "").toLowerCase() === (track ?? "").toLowerCase();
  const previous = actives?.find((r) => sameTrack(r.track)) ?? actives?.find((r) => r.track === null) ?? null;
  const toDeactivate = user.supabase.from("resumes").update({ is_active: false }).eq("is_active", true);
  await (track === null ? toDeactivate.is("track", null) : toDeactivate.ilike("track", trackPattern(track)));
  const { error } = await user.supabase.from("resumes").insert({
    id,
    user_id: user.userId,
    label,
    file_name: file instanceof File ? file.name.slice(0, 255) : null,
    source_kind: text.kind,
    original_file_path: originalPath,
    raw_text: text.text,
    profile: asJson(parsed.profile),
    original_profile: asJson(parsed.profile),
    field_meta: asJson(parsed.meta),
    facts: previous?.facts ?? {},
    parsed_with: parsedWith,
    is_active: true,
    track,
  });
  if (error) {
    if (originalPath) await user.supabase.storage.from("resumes").remove([originalPath]);
    return NextResponse.json({ error: "Couldn't save the resume. Try again." }, { status: 500 });
  }
  await saveResumeLines(user.supabase, user.userId, id, parsed.profile, jobServices().embedder);
  await logActivity(user, "jobs.resume_uploaded", { resume: id, parsed_with: parsedWith, source: text.kind, track: trackLabel(track) });

  const summary = importSummary(parsed.profile, parsed.meta);
  const body: ResumeImportResponse = {
    id,
    filled: summary.filled,
    needsReview: summary.needsReview.map((path) => ({ path, label: fieldLabel(path, parsed.profile) })),
    missing: summary.missing.map((path) => ({ path, label: fieldLabel(path, parsed.profile), reason: parsed.meta[path]?.reason ?? "Not found in your resume." })),
    completeness: summary.completeness,
    parsedWith,
    warnings,
  };
  return NextResponse.json(body, { status: 201 });
}
