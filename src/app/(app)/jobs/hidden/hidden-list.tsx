"use client";

import { useTr } from "@/lib/i18n/client";
import { useState } from "react";
import { removeJobFilter, hideTitlePattern } from "./actions";
import { useActionRunner } from "@/components/toast/use-action-runner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export type HiddenItem = { id: string; kind: "company" | "title"; pattern: string };

/** The hidden companies and title words, each with a Show again button, and a form to hide a title word. */
export function HiddenList({ items }: { items: HiddenItem[] }) {
  const { pending, run } = useActionRunner();
  const tr = useTr();
  const [word, setWord] = useState("");
  return (
    <div className="grid gap-6">
      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          let filterId: string | null = null;
          run(
            async () => {
              const r = await hideTitlePattern(word);
              if (r.ok) filterId = r.data?.filterId ?? null;
              return r;
            },
            { undo: async () => (filterId ? removeJobFilter(filterId) : { ok: true as const }), onSuccess: () => setWord("") },
          );
        }}
      >
        <div className="grid gap-1">
          <label htmlFor="hide-title" className="text-sm font-medium">
            {tr("msg.hideTitlesContaining73bb", "Hide titles containing")}
          </label>
          <Input id="hide-title" value={word} onChange={(e) => setWord(e.target.value)} maxLength={80} placeholder={tr("msg.forExampleIntern3e92", "for example: intern")} className="w-64" />
        </div>
        <Button type="submit" size="sm" disabled={pending || word.trim().length < 2}>
          {tr("msg.hide62a5", "Hide")}
        </Button>
      </form>
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">{tr("msg.nothingIsHiddenUse3d57", "Nothing is hidden. Use “Hide jobs from…” in a job’s More menu, or add a title word above.")}</p>
      ) : (
        <ul className="grid gap-2" aria-label={tr("msg.hiddenCompaniesAndTitles17fe", "Hidden companies and titles")}>
          {items.map((i) => (
            <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-card px-3 py-2 text-sm">
              <span>
                <span className="text-muted-foreground">{i.kind === "company" ? tr("msg.company17a1", "Company: ") : tr("msg.titleContainsfab9", "Title contains: ")}</span>
                <span className="font-medium">{i.pattern}</span>
              </span>
              <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => removeJobFilter(i.id))}>
                {tr("msg.showAgainb98e", "Show again")}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
