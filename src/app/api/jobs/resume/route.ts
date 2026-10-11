import { NextResponse } from "next/server";
import type { Json } from "@/lib/supabase/database.types";
import { pdfToText } from "@/lib/job-postings/pdf-text";
import { saveResumeLines } from "@/lib/job-postings/service";
import { jobServices } from "@/lib/job-postings/services";
import { disabledLLM } from "@/lib/discovery/llm";
import { parseResume } from "@/lib/job-postings/resume";
import { logActivity } from "@/lib/server/action-context";
import { routeUser, unauthorized } from "@/lib/server/route-auth";

// Reading the PDF and embedding its lines.
export const maxDuration = 60;

const MAX_RESUMES = 10;

/**
 * Uploads a resume PDF: reads its text, structures it and makes it the active resume.
 * The PDF itself is discarded once read; only the text and the structure are kept.
 */
export async function POST(request: Request) {
  const user = await routeUser();
  if (!user) return unauthorized();
  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "Choose a PDF to upload." }, { status: 400 });
  if (file.type && file.type !== "application/pdf") return NextResponse.json({ error: "That isn't a PDF. Export your resume as a PDF and try again." }, { status: 400 });

  const { count } = await user.supabase.from("resumes").select("id", { count: "exact", head: true });
  if ((count ?? 0) >= MAX_RESUMES) return NextResponse.json({ error: `You can keep ${MAX_RESUMES} resumes. Delete one first.` }, { status: 409 });

  const text = await pdfToText(new Uint8Array(await file.arrayBuffer()));
  if (!text.ok) return NextResponse.json({ error: text.error }, { status: 400 });

  // Parsing is free (no AI); the user checks and corrects the result on the Resume page.
  const services = jobServices();
  const { profile, parsedWith, note } = await parseResume(text.text, disabledLLM);
  const label = (form?.get("label")?.toString().trim() || file.name.replace(/\.pdf$/i, "")).slice(0, 100) || "Resume";

  // Only one resume is active; the new one replaces it. Its facts carry over.
  const { data: previous } = await user.supabase.from("resumes").select("facts").eq("is_active", true).maybeSingle();
  await user.supabase.from("resumes").update({ is_active: false }).eq("is_active", true);
  const { data, error } = await user.supabase
    .from("resumes")
    .insert({
      user_id: user.userId,
      label,
      file_name: file.name.slice(0, 255),
      raw_text: text.text,
      profile: profile as unknown as NonNullable<Json>,
      facts: previous?.facts ?? {},
      parsed_with: parsedWith,
      is_active: true,
    })
    .select("id")
    .single();
  if (error || !data) return NextResponse.json({ error: "Couldn't save the resume. Try again." }, { status: 500 });
  await saveResumeLines(user.supabase, user.userId, data.id, profile, services.embedder);
  await logActivity(user, "jobs.resume_uploaded", { resume: data.id, parsed_with: parsedWith });
  return NextResponse.json({ id: data.id, note }, { status: 201 });
}
