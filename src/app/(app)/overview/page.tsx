import { Suspense } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DISCIPLINE_LABELS,
  UNIVERSITY_LABELS,
  type Discipline,
  type University,
} from "@/lib/domain";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Overview · Network Growth" };

export default function OverviewPage() {
  return (
    <Suspense fallback={<p className="text-sm text-muted-foreground">Loading your targets…</p>}>
      <OverviewContent />
    </Suspense>
  );
}

async function OverviewContent() {
  const supabase = await createClient();
  const [{ data: settings }, { data: targets, error }] = await Promise.all([
    supabase
      .from("settings")
      .select("overall_target, discipline_priority, project_start_date")
      .maybeSingle(),
    supabase.from("targets").select("discipline, university, target_count"),
  ]);

  if (error || !settings) {
    return (
      <p role="alert" className="text-sm text-destructive">
        Your workspace settings couldn&apos;t be loaded. Refresh the page; if it keeps happening,
        sign out and back in.
      </p>
    );
  }

  const byDiscipline = new Map<Discipline, { total?: number; cells: [University, number][] }>();
  for (const t of targets ?? []) {
    const entry = byDiscipline.get(t.discipline) ?? { cells: [] };
    if (t.university === null) entry.total = t.target_count;
    else entry.cells.push([t.university, t.target_count]);
    byDiscipline.set(t.discipline, entry);
  }

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-xl font-semibold">Overview</h1>
        <p className="text-sm text-muted-foreground">
          Goal: {settings.overall_target.toLocaleString()} total connections. Project started{" "}
          {settings.project_start_date}.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Targets</CardTitle>
          <CardDescription>
            New accepted connections needed, in priority order. Progress tracking arrives in
            phase 2.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ol className="grid gap-3 sm:grid-cols-2">
            {settings.discipline_priority.map((d, i) => {
              const entry = byDiscipline.get(d);
              return (
                <li key={d} className="rounded-lg border p-3">
                  <p className="font-medium">
                    {i + 1}. {DISCIPLINE_LABELS[d]}
                  </p>
                  <p className="text-sm">Target: {entry?.total ?? "not set"}</p>
                  <ul className="mt-1 text-sm text-muted-foreground">
                    {entry?.cells.map(([u, n]) => (
                      <li key={u}>
                        {UNIVERSITY_LABELS[u]}: {n}
                      </li>
                    ))}
                  </ul>
                </li>
              );
            })}
          </ol>
          <p className="mt-3 text-sm text-muted-foreground">
            SFU and Waterloo are additional candidate pools and don&apos;t raise the total.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
