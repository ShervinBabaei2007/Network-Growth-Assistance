import { NextResponse, type NextRequest } from "next/server";
import { profileToDoc } from "@/lib/job-postings/base-doc";
import { renderDocx } from "@/lib/job-postings/render/docx";
import { fileName, resumeBlocks } from "@/lib/job-postings/render/layout";
import { renderPdf } from "@/lib/job-postings/render/pdf";
import { ResumeProfile } from "@/lib/job-postings/types";
import { isUuid, notFound, routeUser, unauthorized } from "@/lib/server/route-auth";

/** Downloads a base resume (a track's current profile, word for word, nothing tailored) as PDF or Word. */
export async function GET(request: NextRequest, { params }: RouteContext<"/api/jobs/resume/[id]/download">) {
  const user = await routeUser();
  if (!user) return unauthorized();
  const { id } = await params;
  if (!isUuid(id)) return notFound();
  const format = request.nextUrl.searchParams.get("format") === "docx" ? "docx" : "pdf";
  const { data: resume } = await user.supabase.from("resumes").select("profile, track").eq("id", id).maybeSingle();
  if (!resume) return notFound();
  const profile = ResumeProfile.safeParse(resume.profile);
  if (!profile.success) return NextResponse.json({ error: "This resume's profile is damaged. Import it again." }, { status: 500 });

  const doc = profileToDoc(profile.data);
  const name = doc.header.name;
  const title = `Resume${name ? ` – ${name}` : ""}`;
  const file = fileName(name, "resume", resume.track, format);
  const blocks = resumeBlocks(doc);
  const body = format === "docx" ? await renderDocx(blocks, title) : await renderPdf(blocks, title, name);
  return new NextResponse(new Uint8Array(body), {
    headers: {
      "Content-Type": format === "docx" ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document" : "application/pdf",
      "Content-Disposition": `attachment; filename="${file}"`,
      "Cache-Control": "no-store",
    },
  });
}
