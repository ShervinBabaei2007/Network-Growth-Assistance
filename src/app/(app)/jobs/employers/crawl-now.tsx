"use client";

import { useState, useTransition } from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { crawlNow } from "../actions";

export function CrawlNowButton() {
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button
        variant="outline"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await crawlNow();
            setMessage(r.ok ? { ok: true, text: r.message ?? "Done." } : { ok: false, text: r.error });
          })
        }
      >
        <RefreshCw aria-hidden className={pending ? "animate-spin" : undefined} /> {pending ? "Reading boards…" : "Read due boards now"}
      </Button>
      {message ? (
        <p role={message.ok ? "status" : "alert"} className={message.ok ? "text-sm text-muted-foreground" : "text-sm text-destructive"}>
          {message.text}
        </p>
      ) : null}
    </div>
  );
}
