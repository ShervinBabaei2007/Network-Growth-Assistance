"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Keyboard, Plus, Settings, Sparkles, Upload } from "lucide-react";
import { NAV_ITEMS } from "@/components/app-nav";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator, CommandShortcut } from "@/components/ui/command";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { cleanQuery, type PaletteHit, type PaletteResults } from "@/lib/search/palette";
import { useT } from "@/lib/i18n/client";
import type { MessageKey } from "@/lib/i18n/core";
import { PAGE_SHORTCUTS } from "@/lib/shortcuts";

const PAGES: { href: string; labelKey: MessageKey; icon: typeof Plus }[] = [
  ...NAV_ITEMS.map((i) => ({ href: i.href, labelKey: i.labelKey, icon: i.icon })),
  { href: "/notifications", labelKey: "nav.notifications", icon: Sparkles },
  { href: "/settings", labelKey: "nav.settings", icon: Settings },
  { href: "/help", labelKey: "nav.help", icon: Keyboard },
];

const ACTIONS: { href: string; labelKey: MessageKey; icon: typeof Plus }[] = [
  { href: "/candidates", labelKey: "palette.addCandidate", icon: Plus },
  { href: "/candidates/import", labelKey: "palette.importPeople", icon: Upload },
  { href: "/jobs/add", labelKey: "palette.addJob", icon: Plus },
  { href: "/overview?tour=1", labelKey: "palette.takeTour", icon: Sparkles },
];

const GROUPS: { key: keyof PaletteResults; heading: MessageKey }[] = [
  { key: "candidates", heading: "palette.candidatesGroup" },
  { key: "people", heading: "palette.peopleGroup" },
  { key: "applications", heading: "palette.applicationsGroup" },
  { key: "jobs", heading: "palette.jobsGroup" },
];

/** The label key of each page, so the shortcut list can name them in the person's language. */
const PAGE_LABEL = Object.fromEntries(PAGES.map((p) => [p.href, p.labelKey])) as Record<string, MessageKey>;

const shortcutFor = (href: string) => PAGE_SHORTCUTS.find((s) => s.href === href);

/** The command palette and the shortcut sheet. Loaded the first time either is opened. */
export default function Palette({ mode, onClose, onShowShortcuts }: { mode: "search" | "shortcuts"; onClose: () => void; onShowShortcuts: () => void }) {
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      {mode === "search" ? <SearchDialog onClose={onClose} onShowShortcuts={onShowShortcuts} /> : <ShortcutSheet />}
    </Dialog>
  );
}

function SearchDialog({ onClose, onShowShortcuts }: { onClose: () => void; onShowShortcuts: () => void }) {
  const router = useRouter();
  const t = useT();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PaletteResults | null>(null);
  const [state, setState] = useState<"idle" | "loading" | "error">("idle");

  const q = cleanQuery(query);
  useEffect(() => {
    if (!q) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setState("loading");
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`, { signal: controller.signal });
        if (!res.ok) throw new Error("search failed");
        setResults(await res.json());
        setState("idle");
      } catch (e) {
        if (!(e instanceof DOMException && e.name === "AbortError")) setState("error");
      }
    }, 200);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [q]);

  const go = (href: string) => {
    onClose();
    router.push(href);
  };
  const needle = query.trim().toLowerCase();
  const matches = <T extends { labelKey: MessageKey }>(items: T[]) => (needle ? items.filter((i) => t(i.labelKey).toLowerCase().includes(needle)) : items);
  const pages = matches(PAGES);
  const actions = matches(ACTIONS);
  const hits = q && results ? GROUPS.map((g) => ({ ...g, items: results[g.key] as PaletteHit[] })).filter((g) => g.items.length > 0) : [];

  return (
    <DialogContent className="gap-0 overflow-hidden p-0 sm:top-[20%] sm:translate-y-0" data-testid="command-palette">
      <DialogTitle className="sr-only">{t("common.searchAndCommands")}</DialogTitle>
      <DialogDescription className="sr-only">{t("palette.description")}</DialogDescription>
      <Command shouldFilter={false} label={t("common.searchAndCommands")}>
        <CommandInput value={query} onValueChange={setQuery} placeholder={t("palette.placeholder")} aria-label={t("common.searchAndCommands")} />
        <CommandList>
          {pages.length === 0 && actions.length === 0 && hits.length === 0 ? (
            <CommandEmpty>{state === "loading" ? t("palette.searching") : state === "error" ? t("palette.failed") : q ? t("palette.nothing") : t("palette.noMatch")}</CommandEmpty>
          ) : null}
          {hits.map((g) => (
            <CommandGroup key={g.key} heading={t(g.heading)}>
              {g.items.map((hit) => (
                <CommandItem key={hit.id} value={`${g.key}-${hit.id}`} onSelect={() => go(hit.href)}>
                  <span className="truncate">{hit.label}</span>
                  {hit.detail ? <span className="ml-2 truncate text-xs text-muted-foreground">{hit.detail}</span> : null}
                </CommandItem>
              ))}
            </CommandGroup>
          ))}
          {hits.length > 0 && (pages.length > 0 || actions.length > 0) ? <CommandSeparator /> : null}
          {pages.length > 0 ? (
            <CommandGroup heading={t("palette.goTo")}>
              {pages.map(({ href, labelKey, icon: Icon }) => {
                const chord = shortcutFor(href);
                return (
                  <CommandItem key={href} value={`page-${href}`} onSelect={() => go(href)}>
                    <Icon aria-hidden />
                    {t(labelKey)}
                    {chord ? <CommandShortcut>{t("palette.gThen", { key: chord.key })}</CommandShortcut> : null}
                  </CommandItem>
                );
              })}
            </CommandGroup>
          ) : null}
          {actions.length > 0 ? (
            <CommandGroup heading={t("palette.actions")}>
              {actions.map(({ href, labelKey, icon: Icon }) => (
                <CommandItem key={labelKey} value={`action-${labelKey}`} onSelect={() => go(href)}>
                  <Icon aria-hidden />
                  {t(labelKey)}
                </CommandItem>
              ))}
              <CommandItem value="action-shortcuts" onSelect={onShowShortcuts}>
                <Keyboard aria-hidden />
                {t("palette.showShortcuts")}
                <CommandShortcut>?</CommandShortcut>
              </CommandItem>
            </CommandGroup>
          ) : null}
        </CommandList>
      </Command>
    </DialogContent>
  );
}

function ShortcutSheet() {
  const t = useT();
  const rows: [string, string][] = [
    ["Ctrl K  /  /", t("palette.searchShortcut")],
    ["?", t("palette.listShortcut")],
    ...PAGE_SHORTCUTS.map((s) => [t("palette.gThen", { key: s.key }), t("palette.goToPage", { page: t(PAGE_LABEL[s.href] ?? "nav.overview") })] as [string, string]),
  ];
  return (
    <DialogContent data-testid="shortcut-sheet">
      <DialogTitle>{t("palette.shortcutsTitle")}</DialogTitle>
      <DialogDescription>{t("palette.shortcutsNote")}</DialogDescription>
      <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1.5">
        {rows.map(([keys, what]) => (
          <div key={keys} className="contents">
            <dt className="font-mono text-xs">{keys}</dt>
            <dd>{what}</dd>
          </div>
        ))}
      </dl>
    </DialogContent>
  );
}
