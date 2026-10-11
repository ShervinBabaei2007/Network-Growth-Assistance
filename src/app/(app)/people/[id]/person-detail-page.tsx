"use client";

import { useRouter } from "next/navigation";
import { PersonDetailView } from "@/components/discovery/person-detail";
import type { PersonDetail } from "@/lib/discovery/results";

/** The detail view on its own page; actions re-render it from the server. */
export function PersonDetailPage({ detail }: { detail: PersonDetail }) {
  const router = useRouter();
  return <PersonDetailView detail={detail} onChange={() => router.refresh()} />;
}
