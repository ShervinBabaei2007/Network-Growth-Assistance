import { NextResponse } from "next/server";
import { EXCLUDED_TABLES, EXPORT_SCHEMA_VERSION, EXPORTED_TABLES, SAMPLE_FLAGGED_TABLES } from "@/lib/data/export-inventory";
import { allow, LIMITS } from "@/lib/server/rate-limit";
import { routeUser, unauthorized } from "@/lib/server/route-auth";

const PAGE = 1000;

type Page = PromiseLike<{ data: unknown[] | null; error: unknown }>;
/** Any table by name, read a page at a time. The inventory is checked against the schema in tests. */
type AnyTable = (table: string) => { select: (columns: string) => { range: (from: number, to: number) => Page } };

async function allRows(query: (from: number, to: number) => Page): Promise<unknown[] | null> {
  const rows: unknown[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await query(from, from + PAGE - 1);
    if (error || !data) return null;
    rows.push(...data);
    if (data.length < PAGE) return rows;
  }
}

/** Downloads everything stored for the signed-in user as one JSON file. */
export async function GET() {
  const user = await routeUser();
  if (!user) return unauthorized();
  if (!(await allow(user.supabase, LIMITS.export))) return NextResponse.json({ error: LIMITS.export.message }, { status: 429 });
  const db = user.supabase;
  const failed = () => NextResponse.json({ error: "Export failed. Try again." }, { status: 500 });

  const out: Record<string, unknown[]> = {};
  const from = db.from.bind(db) as unknown as AnyTable;
  for (const table of EXPORTED_TABLES) {
    // RLS limits every table to the caller's own rows.
    const rows = await allRows((start, end) => from(table).select("*").range(start, end));
    if (!rows) return failed();
    // Example data from the demo workspace isn't the user's own, so it is never exported.
    out[table] = SAMPLE_FLAGGED_TABLES.includes(table) ? rows.filter((r) => !(r as { is_sample?: boolean }).is_sample) : rows;
  }
  // Events of an example application have nowhere to point once it is left out.
  const keptApplications = new Set((out.applications as { id: string }[]).map((a) => a.id));
  out.application_events = out.application_events.filter((e) => keptApplications.has((e as { application_id: string }).application_id));

  // Postings the user pasted, not the shared listings everyone can read.
  const jobs = await allRows((from, to) => db.from("jobs").select("*").eq("user_id", user.userId).order("id").range(from, to));
  if (!jobs) return failed();
  out.jobs = jobs;
  const jobIds = (jobs as { id: string }[]).map((j) => j.id);
  const requirements: unknown[] = [];
  for (let i = 0; i < jobIds.length; i += 200) {
    const rows = await allRows((from, to) => db.from("job_requirements").select("*").in("job_id", jobIds.slice(i, i + 200)).range(from, to));
    if (!rows) return failed();
    requirements.push(...rows);
  }
  out.job_requirements = requirements;

  // Never the encrypted key itself.
  const { data: ai, error: aiError } = await db.from("user_ai").select("own_key_hint, updated_at");
  if (aiError) return failed();
  out.user_ai = ai;

  const files = (out.resumes as { id: string; label: string; original_file_path: string | null }[])
    .filter((r) => r.original_file_path)
    .map((r) => ({ resumeId: r.id, label: r.label, storedAs: r.original_file_path, download: `/api/jobs/resume/${r.id}/original` }));

  const now = new Date();
  const body = {
    schemaVersion: EXPORT_SCHEMA_VERSION,
    exportedAt: now.toISOString(),
    notes: {
      files: "Uploaded resume files aren't inside this JSON. Download each from its link while signed in.",
      notIncluded: EXCLUDED_TABLES,
    },
    files,
    ...out,
  };
  return new NextResponse(JSON.stringify(body, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="network-growth-export-${now.toISOString().slice(0, 10)}.json"`,
      "Cache-Control": "no-store",
    },
  });
}
