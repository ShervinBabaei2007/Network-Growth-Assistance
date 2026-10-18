import { Suspense } from "react";
import Link from "next/link";
import { MessageCircleHeart } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { LoadError } from "@/components/load-error";
import { PageHeader } from "@/components/page-header";
import { PageSkeleton } from "@/components/page-skeleton";
import { buttonVariants } from "@/components/ui/button";
import { formatDateOnly } from "@/lib/applications/format";
import { loadCatalog } from "@/lib/data/catalog";
import { localDate } from "@/lib/dates";
import { disciplineName, universityName } from "@/lib/domain";
import { draftFollowUp, dueState, FOLLOW_UP_LABELS, isDue, type FollowUpKind } from "@/lib/follow-ups/templates";
import { createClient } from "@/lib/supabase/server";
import { FollowUpItem, type FollowUpView } from "./follow-up-item";

export const metadata = { title: "Follow-ups · Network Growth" };

export default function FollowUpsPage() {
  return (
    <div className="grid gap-6">
      <PageHeader
        title="Follow-ups"
        description="When someone accepts your invitation, the app suggests the next touches: a thank-you, a short chat, and check-ins after 30 and 90 days. It writes a draft; you send it."
      />
      <Suspense fallback={<PageSkeleton label="Loading your follow-ups…" />}>
        <FollowUps />
      </Suspense>
    </div>
  );
}

async function FollowUps() {
  const supabase = await createClient();
  const [{ data, error }, { data: settings }, catalog] = await Promise.all([
    supabase
      .from("follow_ups")
      .select("id, kind, due_on, candidate_id, candidates(full_name, role, university, discipline)")
      .eq("state", "suggested")
      .order("due_on")
      .limit(200),
    supabase.from("settings").select("timezone").single(),
    loadCatalog(supabase).catch(() => null),
  ]);
  if (error || !catalog) return <LoadError what="your follow-ups" />;

  const today = localDate(new Date(), settings?.timezone ?? "UTC");
  const items: FollowUpView[] = data.flatMap((row) => {
    const c = row.candidates;
    if (!c) return [];
    const kind = row.kind as FollowUpKind;
    const school = c.university ? universityName(catalog, c.university) : null;
    const program = c.discipline ? disciplineName(catalog, c.discipline) : null;
    return [
      {
        id: row.id,
        candidateId: row.candidate_id,
        name: c.full_name,
        detail: [c.role, program, school].filter(Boolean).join(" · "),
        title: FOLLOW_UP_LABELS[kind].title,
        dueOn: row.due_on,
        dueLabel: formatDateOnly(row.due_on),
        dueState: dueState(row.due_on, today),
        draft: draftFollowUp(kind, { fullName: c.full_name, school, program }),
      },
    ];
  });

  if (items.length === 0) {
    return (
      <EmptyState
        icon={<MessageCircleHeart aria-hidden />}
        title="No follow-ups waiting"
        description="When someone accepts an invitation you sent, their next touches appear here. Record acceptances on Candidates or import your connections."
      >
        <Link href="/candidates" className={buttonVariants({ variant: "outline" })}>
          Go to Candidates
        </Link>
      </EmptyState>
    );
  }

  const due = items.filter((i) => isDue(i.dueOn, today));
  const later = items.filter((i) => !isDue(i.dueOn, today));
  return (
    <div className="grid gap-8">
      <section aria-labelledby="due" className="grid gap-3">
        <h2 id="due" className="text-lg font-semibold">
          Due now <span className="text-muted-foreground">({due.length})</span>
        </h2>
        {due.length ? due.map((i) => <FollowUpItem key={i.id} item={i} />) : <p className="text-sm text-muted-foreground">Nothing is due today. You are up to date.</p>}
      </section>
      {later.length ? (
        <section aria-labelledby="later" className="grid gap-3">
          <h2 id="later" className="text-lg font-semibold">
            Coming up <span className="text-muted-foreground">({later.length})</span>
          </h2>
          {later.map((i) => (
            <FollowUpItem key={i.id} item={i} />
          ))}
        </section>
      ) : null}
    </div>
  );
}
