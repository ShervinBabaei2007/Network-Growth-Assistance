import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { loadPersonDetail } from "@/lib/discovery/results";
import { ReferralActions } from "@/components/companies/person-actions";
import { PersonDetailPage } from "./person-detail-page";

export async function PersonRecord({ params }: Pick<PageProps<"/people/[id]">, "params">) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const detail = await loadPersonDetail(await createClient(), id);
  if (!detail) notFound();
  return (
    <>
      <h1 className="text-xl font-semibold">{detail.person.full_name}</h1>
      <PersonDetailPage detail={detail} />
      <section aria-labelledby="referrals" className="grid gap-2 rounded-xl border bg-card p-4">
        <h2 id="referrals" className="font-medium">
          Referrals
        </h2>
        <p className="text-sm text-muted-foreground">
          Record a referral here, or from an application&apos;s “People at” card to link it to that application and its timeline.
        </p>
        <ReferralActions personId={detail.person.id} personName={detail.person.full_name} applicationId={null} aiAvailable={false} />
      </section>
    </>
  );
}
