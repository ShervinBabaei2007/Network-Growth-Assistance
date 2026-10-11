import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { loadPersonDetail } from "@/lib/discovery/results";
import { PersonDetailPage } from "./person-detail-page";

export const metadata = { title: "Person · Network Growth" };

export default function PersonPage({ params }: PageProps<"/people/[id]">) {
  return (
    <div className="grid max-w-3xl gap-6">
      <Link href="/people" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden /> People
      </Link>
      <Suspense fallback={<p className="text-sm text-muted-foreground">Loading…</p>}>
        <Person params={params} />
      </Suspense>
    </div>
  );
}

async function Person({ params }: Pick<PageProps<"/people/[id]">, "params">) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const detail = await loadPersonDetail(await createClient(), id);
  if (!detail) notFound();
  return (
    <>
      <h1 className="text-xl font-semibold">{detail.person.full_name}</h1>
      <PersonDetailPage detail={detail} />
    </>
  );
}
