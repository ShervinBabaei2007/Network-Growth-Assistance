import { unstable_rethrow } from "next/navigation";
import { Suspense } from "react";
import { LoadError } from "@/components/load-error";
import { MeterLegend, ProgressMeter } from "@/components/progress-meter";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { currentUserId, loadProgress } from "@/lib/data/dashboard";
import { DISCIPLINE_LABELS } from "@/lib/domain";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Disciplines · Network Growth" };

export default function DisciplinesPage() {
  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-xl font-semibold">Disciplines</h1>
        <p className="text-sm text-muted-foreground">
          Attention goes to the highest-priority discipline whose target isn&apos;t met yet.
        </p>
      </div>
      <Suspense fallback={<p className="text-sm text-muted-foreground">Loading…</p>}>
        <DisciplineCards />
      </Suspense>
    </div>
  );
}

async function DisciplineCards() {
  let progress;
  try {
    const supabase = await createClient();
    progress = await loadProgress(supabase, await currentUserId(supabase));
  } catch (e) {
    unstable_rethrow(e); // let Next.js postpone/redirect signals through
    return <LoadError what="discipline progress" />;
  }

  return (
    <>
      <MeterLegend />
      <div className="grid gap-4 lg:grid-cols-2">
        {progress.disciplines.map((d) => {
          const name = DISCIPLINE_LABELS[d.discipline];
          const shortOfCandidates = !d.complete && d.available < d.remaining;
          return (
            <Card key={d.discipline} className={d.isFocus ? "border-primary/40" : undefined}>
              <CardHeader>
                <CardDescription>Priority {d.rank}</CardDescription>
                <CardTitle className="flex flex-wrap items-center gap-2">
                  {name}
                  {d.isFocus ? <Badge>Focus</Badge> : null}
                  {d.complete ? <Badge variant="secondary">Target met</Badge> : null}
                </CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4">
                <div className="grid gap-1.5">
                  <ProgressMeter label={`${name} progress`} accepted={d.accepted} pending={d.pending} target={d.target} />
                  <p className="text-sm text-muted-foreground">
                    {d.accepted} of {d.target} accepted ({d.percent}%)
                  </p>
                </div>
                <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-3">
                  <Fact label="Remaining" value={d.remaining} />
                  <Fact label="Pending" value={d.pending} />
                  <Fact label="Ready for outreach" value={d.available} />
                  <Fact label="From U of T + UBC" value={d.acceptedPrimary} />
                  <Fact label="From SFU + Waterloo" value={d.acceptedAdditional} />
                </dl>
                {shortOfCandidates ? (
                  <p className="text-sm">
                    <Badge variant="outline">Low candidate pool</Badge> {d.available} approved
                    candidate{d.available === 1 ? "" : "s"} for {d.remaining} remaining. Add more
                    before this discipline becomes the focus.
                  </p>
                ) : null}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </>
  );
}

function Fact({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="font-medium">{value.toLocaleString("en-CA")}</dd>
    </div>
  );
}
