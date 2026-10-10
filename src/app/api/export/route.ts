import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const TABLES = ["settings", "targets", "candidates", "invitations", "connection_snapshots", "daily_queue", "job_runs", "activity_logs"] as const;
const PAGE = 1000;

/** Downloads everything stored for the signed-in user as one JSON file. */
export async function GET() {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  const out: Record<string, unknown[]> = {};
  for (const table of TABLES) {
    const rows: unknown[] = [];
    for (let from = 0; ; from += PAGE) {
      // RLS limits every table to the caller's own rows.
      const { data, error } = await supabase.from(table).select("*").range(from, from + PAGE - 1);
      if (error) return NextResponse.json({ error: "Export failed. Try again." }, { status: 500 });
      rows.push(...data);
      if (data.length < PAGE) break;
    }
    out[table] = rows;
  }

  const date = new Date().toISOString().slice(0, 10);
  return new NextResponse(JSON.stringify({ exportedAt: new Date().toISOString(), ...out }, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="network-growth-export-${date}.json"`,
      "Cache-Control": "no-store",
    },
  });
}
