"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Keyboard, Plus, Settings, Sparkles, Upload } from "lucide-react";
import { NAV_ITEMS } from "@/components/app-nav";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator, CommandShortcut } from "@/components/ui/command";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { cleanQuery, type PaletteHit, type PaletteResults } from "@/lib/search/palette";
import { PAGE_SHORTCUTS } from "@/lib/shortcuts";

const PAGES = [
  ...NAV_ITEMS.map((i) => ({ href: i.href, label: i.label, icon: i.icon })),
  { href: "/notifications", label: "Notifications", icon: Sparkles },
  { href: "/settings", label: "Settings", icon: Settings },
  { href: "/help", label: "Help", icon: Keyboard },
];

const ACTIONS = [
  { href: "/candidates", label: "Add a candidate", icon: Plus },
  { href: "/candidates/import", label: "Import people from a file", icon: Upload },
  { href: "/jobs/add", label: "Add a job", icon: Plus },
  { href: "/overview?tour=1", label: "Take the tour", icon: Sparkles },
];

const GROUPS: { key: keyof PaletteResults; heading: string }[] = [
  { key: "candidates", heading: "Candidates" },
  { key: "people", heading: "People" },
  { key: "applications", heading: "Applications" },
  { key: "jobs", heading: "Jobs" },
];

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
  const matches = <T extends { label: string }>(items: T[]) => (needle ? items.filter((i) => i.label.toLowerCase().includes(needle)) : items);
  const pages = matches(PAGES);
  const actions = matches(ACTIONS);
  const hits = q && results ? GROUPS.map((g) => ({ ...g, items: results[g.key] as PaletteHit[] })).filter((g) => g.items.length > 0) : [];

  return (
    <DialogContent className="gap-0 overflow-hidden p-0 sm:top-[20%] sm:translate-y-0" data-testid="command-palette">
      <DialogTitle className="sr-only">Search and commands</DialogTitle>
      <DialogDescription className="sr-only">Type to jump to a page or find a person, candidate, application or job. Use the arrow keys and Enter.</DialogDescription>
      <Command shouldFilter={false} label="Search and commands">
        <CommandInput value={query} onValueChange={setQuery} placeholder="Jump to a page or search…" aria-label="Search and commands" />
        <CommandList>
          {pages.length === 0 && actions.length === 0 && hits.length === 0 ? (
            <CommandEmpty>{state === "loading" ? "Searching…" : state === "error" ? "Search failed. Try again." : q ? "Nothing found." : "No matching page or command."}</CommandEmpty>
          ) : null}
          {hits.map((g) => (
            <CommandGroup key={g.key} heading={g.heading}>
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
            <CommandGroup heading="Go to">
              {pages.map(({ href, label, icon: Icon }) => {
                const chord = shortcutFor(href);
                return (
                  <CommandItem key={href} value={`page-${href}`} onSelect={() => go(href)}>
                    <Icon aria-hidden />
                    {label}
                    {chord ? <CommandShortcut>g {chord.key}</CommandShortcut> : null}
                  </CommandItem>
                );
              })}
            </CommandGroup>
          ) : null}
          {actions.length > 0 ? (
            <CommandGroup heading="Do">
              {actions.map(({ href, label, icon: Icon }) => (
                <CommandItem key={label} value={`action-${label}`} onSelect={() => go(href)}>
                  <Icon aria-hidden />
                  {label}
                </CommandItem>
              ))}
              <CommandItem value="action-shortcuts" onSelect={onShowShortcuts}>
                <Keyboard aria-hidden />
                Show keyboard shortcuts
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
  const rows: [string, string][] = [
    ["Ctrl K  or  /", "Search and commands"],
    ["?", "This list"],
    ...PAGE_SHORTCUTS.map((s) => [`g then ${s.key}`, `Go to ${s.label}`] as [string, string]),
  ];
  return (
    <DialogContent data-testid="shortcut-sheet">
      <DialogTitle>Keyboard shortcuts</DialogTitle>
      <DialogDescription>They never fire while you are typing in a field.</DialogDescription>
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
