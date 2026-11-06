import { Suspense } from "react";
import Link from "next/link";
import { MessageCircleHeart } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { LoadError } from "@/components/load-error";
import { PageHeaderT } from "@/components/tx";
import { PageSkeleton } from "@/components/page-skeleton";
import { buttonVariants } from "@/components/ui/button";
import { formatDateOnly } from "@/lib/applications/format";
import { loadCatalog } from "@/lib/data/catalog";
import { localDate } from "@/lib/dates";
import { disciplineName, universityName } from "@/lib/domain";
import { draftFollowUp, dueState, isDue, type FollowUpKind } from "@/lib/follow-ups/templates";
import { createClient } from "@/lib/supabase/server";
import { LocaleScope } from "@/components/locale-scope";
import { getT } from "@/lib/i18n/server";
import type { MessageKey } from "@/lib/i18n";
import { FollowUpItem, type FollowUpView } from "./follow-up-item";

export const metadata = { title: "Follow-ups · Network Growth" };

export default function FollowUpsPage() {
  return (
    <div className="grid gap-6">
      <PageHeaderT
        title="pages.followUps.title"
        description="pages.followUps.description"
      />
      <Suspense fallback={<PageSkeleton labelKey="loading.followUps" />}>
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
  const t = await getT();
  const KIND_TITLE: Record<FollowUpKind, MessageKey> = { thank_you: "followUps.kindThankYou", coffee_chat: "followUps.kindCoffeeChat", check_in_30: "followUps.kindCheckIn30", check_in_90: "followUps.kindCheckIn90" };

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
        title: t(KIND_TITLE[kind]),
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
        title={t("followUps.emptyTitle")}
        description={t("followUps.emptyDesc")}
      >
        <Link href="/candidates" className={buttonVariants({ variant: "outline" })}>
          {t("followUps.goCandidates")}
        </Link>
      </EmptyState>
    );
  }

  const due = items.filter((i) => isDue(i.dueOn, today));
  const later = items.filter((i) => !isDue(i.dueOn, today));
  return (
    <LocaleScope groups={["followUps"]}>
    <div className="grid gap-8">
      <section aria-labelledby="due" className="grid gap-3">
        <h2 id="due" className="text-lg font-semibold">
          {t("followUps.dueNow")} <span className="text-muted-foreground">({due.length})</span>
        </h2>
        {due.length ? due.map((i) => <FollowUpItem key={i.id} item={i} />) : <p className="text-sm text-muted-foreground">{t("followUps.upToDate")}</p>}
      </section>
      {later.length ? (
        <section aria-labelledby="later" className="grid gap-3">
          <h2 id="later" className="text-lg font-semibold">
            {t("followUps.comingUp")} <span className="text-muted-foreground">({later.length})</span>
          </h2>
          {later.map((i) => (
            <FollowUpItem key={i.id} item={i} />
          ))}
        </section>
      ) : null}
    </div>
    </LocaleScope>
  );
}
