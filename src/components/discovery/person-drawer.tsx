"use client";

import { FormError } from "@/components/form-error";
import { useCallback, useState } from "react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import type { PersonDetail } from "@/lib/discovery/results";
import { PersonDetailView } from "./person-detail";

/** Opens the full research record for one person: evidence, scoring, history and actions. */
export function PersonDrawer({ personId, name, searchId }: { personId: string; name: string; searchId?: string }) {
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState<PersonDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/network/people/${personId}`, { cache: "no-store" });
      if (!res.ok) throw new Error();
      setDetail((await res.json()) as PersonDetail);
      setError(null);
    } catch {
      setError("Couldn't load this person. Try again.");
    }
  }, [personId]);

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) void load();
      }}
    >
      <SheetTrigger render={<Button size="sm" variant="outline" />}>View evidence</SheetTrigger>
      <SheetContent side="right" className="w-full overflow-y-auto data-[side=right]:sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>{name}</SheetTitle>
          <SheetDescription>Everything the research found, with sources.</SheetDescription>
        </SheetHeader>
        <div className="px-4 pb-6">
          {error ? (
            <FormError>
              {error}
            </FormError>
          ) : detail ? (
            <PersonDetailView detail={detail} searchId={searchId} onChange={load} />
          ) : (
            <p className="text-sm text-muted-foreground">Loading…</p>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
