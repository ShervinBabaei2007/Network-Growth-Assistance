import Link from "next/link";
import { Check, Circle } from "lucide-react";
import { ChecklistDismiss } from "@/components/onboarding/checklist-dismiss";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { getOnboarding } from "@/lib/onboarding/read";
import { buildChecklist, checklistComplete, type ChecklistFacts } from "@/lib/onboarding/state";
import { createClient } from "@/lib/supabase/server";

type Supabase = Awaited<ReturnType<typeof createClient>>;

/** True when the signed-in user has at least one row. RLS scopes every table to their own data. */
async function hasAny(supabase: Supabase, table: "candidates" | "network_searches" | "resumes" | "applications") {
  const { data } = await supabase.from(table).select("id").limit(1);
  return (data?.length ?? 0) > 0;
}

/** Saved or applied jobs only: hiding a posting also writes a row, and that isn't progress. */
async function hasSavedJob(supabase: Supabase) {
  const { data } = await supabase.from("job_user_states").select("job_id").in("status", ["saved", "applied"]).limit(1);
  return (data?.length ?? 0) > 0;
}

/**
 * A short, dismissible list of first steps. Each tick comes from the user's real records, so it
 * is never out of date, and it disappears by itself once everything is done.
 */
export async function GettingStartedCard({ hasPlan, hasBaseline }: { hasPlan: boolean; hasBaseline: boolean }) {
  const state = await getOnboarding();
  if (!state || state.checklistDismissed || state.status === "new") return null;
  const supabase = await createClient();

  const [hasCandidates, hasSearch, hasResume, hasApplication, hasSaved] = await Promise.all([
    hasAny(supabase, "candidates"),
    hasAny(supabase, "network_searches"),
    hasAny(supabase, "resumes"),
    hasAny(supabase, "applications"),
    hasSavedJob(supabase),
  ]);
  const facts: ChecklistFacts = { hasPlan, hasBaseline, hasCandidates, hasSearch, hasResume, hasJobActivity: hasApplication || hasSaved };
  const items = buildChecklist(state.goal, facts);
  if (checklistComplete(items)) return null;
  const done = items.filter((i) => i.done).length;

  return (
    <Card aria-labelledby="getting-started" data-testid="getting-started" size="sm">
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <h2 id="getting-started" className="font-medium">
            Getting started <span className="font-normal text-muted-foreground">· {done} of {items.length} done</span>
          </h2>
          <ChecklistDismiss />
        </div>
      </CardHeader>
      <CardContent>
        <ul className="grid gap-1">
          {items.map((item) => (
            <li key={item.id}>
              {item.done ? (
                <span className="flex items-center gap-2 py-1 text-muted-foreground">
                  <Check className="size-4 text-success" aria-hidden />
                  <span className="line-through">{item.label}</span>
                  <span className="sr-only">(done)</span>
                </span>
              ) : (
                <Link href={item.href} className="flex min-h-9 items-center gap-2 rounded-md py-1 underline-offset-4 hover:underline focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none">
                  <Circle className="size-4 text-muted-foreground" aria-hidden />
                  {item.label}
                </Link>
              )}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
