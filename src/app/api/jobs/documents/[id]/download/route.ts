import { NextResponse, type NextRequest } from "next/server";
import { CoverLetterDoc, TailoredResumeDoc } from "@/lib/job-postings/documents";
import { renderDocx } from "@/lib/job-postings/render/docx";
import { fileName, letterBlocks, resumeBlocks } from "@/lib/job-postings/render/layout";
import { renderPdf } from "@/lib/job-postings/render/pdf";
import { isUuid, notFound, routeUser, unauthorized } from "@/lib/server/route-auth";

/** Downloads a tailored resume, CV or cover letter (the user's edits if any) as PDF or DOCX. */
export async function GET(request: NextRequest, { params }: RouteContext<"/api/jobs/documents/[id]/download">) {
  const user = await routeUser();
  if (!user) return unauthorized();
  const { id } = await params;
  if (!isUuid(id)) return notFound();
  const format = request.nextUrl.searchParams.get("format") === "docx" ? "docx" : "pdf";

  const { data: doc } = await user.supabase.from("tailored_documents").select("kind, generated, edited, match_id").eq("id", id).is("deleted_at", null).maybeSingle();
  if (!doc) return notFound();
  const { data: match } = await user.supabase.from("job_matches").select("job_id").eq("id", doc.match_id).maybeSingle();
  const { data: posting } = match ? await user.supabase.from("jobs").select("company").eq("id", match.job_id).maybeSingle() : { data: null };

  const content = doc.edited ?? doc.generated;
  let blocks;
  let name: string | null;
  if (doc.kind !== "cover_letter") {
    const parsed = TailoredResumeDoc.safeParse(content);
    if (!parsed.success) return NextResponse.json({ error: "This document is damaged. Regenerate it." }, { status: 500 });
    blocks = resumeBlocks(parsed.data);
    name = parsed.data.header.name;
  } else {
    const parsed = CoverLetterDoc.safeParse(content);
    if (!parsed.success) return NextResponse.json({ error: "This document is damaged. Regenerate it." }, { status: 500 });
    blocks = letterBlocks(parsed.data);
    name = parsed.data.header.name;
  }

  const title = `${doc.kind === "resume" ? "Resume" : doc.kind === "cv" ? "CV" : "Cover letter"}${name ? ` – ${name}` : ""}`;
  const file = fileName(name, doc.kind, posting?.company ?? null, format);
  const body = format === "docx" ? await renderDocx(blocks, title) : await renderPdf(blocks, title, name);
  return new NextResponse(new Uint8Array(body), {
    headers: {
      "Content-Type": format === "docx" ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document" : "application/pdf",
      "Content-Disposition": `attachment; filename="${file}"`,
      "Cache-Control": "no-store",
    },
  });
}
