"use client";

import { useState, useTransition } from "react";
import { removeOwnAiKey } from "@/app/(app)/jobs/actions";
import { Button } from "@/components/ui/button";

export function RemoveAiKeyButton() {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      <Button
        size="sm"
        variant="outline"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await removeOwnAiKey();
            setError(r.ok ? null : r.error);
          })
        }
      >
        Remove key
      </Button>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </>
  );
}
