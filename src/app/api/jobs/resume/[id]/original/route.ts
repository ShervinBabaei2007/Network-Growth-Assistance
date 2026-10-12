import { NextResponse } from "next/server";
import { DOCX_MIME } from "@/lib/job-postings/document-text";
import { isUuid, notFound, routeUser, unauthorized } from "@/lib/server/route-auth";

/** Downloads the original resume file exactly as it was uploaded (or its text, for a pasted one). */
export async function GET(_: Request, { params }: RouteContext<"/api/jobs/resume/[id]/original">) {
  const user = await routeUser();
  if (!user) return unauthorized();
  const { id } = await params;
  if (!isUuid(id)) return notFound();
  const { data: resume } = await user.supabase.from("resumes").select("label, file_name, original_file_path, source_kind, raw_text").eq("id", id).maybeSingle();
  if (!resume) return notFound();

  const base = (resume.file_name ?? resume.label).replace(/[^\w.\- ]+/g, "").trim() || "resume";
  if (!resume.original_file_path) {
    // Pasted (or imported before files were kept): the original is its text.
    return new NextResponse(resume.raw_text, {
      headers: { "Content-Type": "text/plain; charset=utf-8", "Content-Disposition": `attachment; filename="${base.replace(/\.(pdf|docx)$/i, "")}.txt"`, "Cache-Control": "no-store" },
    });
  }
  const { data: file, error } = await user.supabase.storage.from("resumes").download(resume.original_file_path);
  if (error || !file) return NextResponse.json({ error: "The original file couldn't be found." }, { status: 404 });
  return new NextResponse(file, {
    headers: {
      "Content-Type": resume.source_kind === "docx" ? DOCX_MIME : "application/pdf",
      "Content-Disposition": `attachment; filename="${base}"`,
      "Cache-Control": "no-store",
    },
  });
}
