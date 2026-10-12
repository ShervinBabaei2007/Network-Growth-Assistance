"use client";

import { RefreshCw } from "lucide-react";
import { useActionRunner } from "@/components/toast/use-action-runner";
import { Button } from "@/components/ui/button";
import { crawlNow } from "../actions";

export function CrawlNowButton() {
  const { pending, run, last } = useActionRunner();
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button variant="outline" disabled={pending} onClick={() => run(() => crawlNow(), { progress: "Reading the boards that are due…" })}>
        <RefreshCw aria-hidden className={pending ? "animate-spin" : undefined} /> {pending ? "Reading boards…" : "Read due boards now"}
      </Button>
      {last ? <p className={last.ok ? "text-sm text-muted-foreground" : "text-sm text-destructive"}>{last.text}</p> : null}
    </div>
  );
}
