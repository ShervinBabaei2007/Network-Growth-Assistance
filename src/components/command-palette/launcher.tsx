"use client";

import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CHORD_WINDOW_MS, intentFor, isTypingTarget, pageForChord } from "@/lib/shortcuts";

// Downloaded the first time it is opened, so it adds nothing to a page's first load.
const Palette = lazy(() => import("./palette"));

const DIALOG_SELECTOR = '[role="dialog"], [role="alertdialog"]';

/**
 * The "Search" button in the header, plus the keyboard shortcuts: Ctrl/Cmd+K or "/" to search, "?" for the list
 * and "g" then a letter to go to a page. Nothing here fires while a field has focus or another dialog is open.
 */
export function CommandLauncher() {
  const router = useRouter();
  const [open, setOpen] = useState<"search" | "shortcuts" | null>(null);
  const chordUntil = useRef(0);

  const close = useCallback(() => setOpen(null), []);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.defaultPrevented || e.isComposing) return;
      const typing = isTypingTarget(e.target as HTMLElement | null);
      // Our own palette is a dialog too; any other open dialog (the welcome, the tour) blocks plain-key shortcuts.
      const otherDialogOpen = !open && Boolean(document.querySelector(DIALOG_SELECTOR));
      // A pending "g" turns the next letter into a page jump.
      if (Date.now() < chordUntil.current && !e.ctrlKey && !e.metaKey && !e.altKey && !typing && !otherDialogOpen && !open) {
        chordUntil.current = 0;
        const href = pageForChord(e.key);
        if (href) {
          e.preventDefault();
          router.push(href);
          return;
        }
      }
      const intent = intentFor(e, { typing, dialogOpen: otherDialogOpen || Boolean(open) });
      if (intent === "search") {
        e.preventDefault();
        setOpen((current) => (current === "search" ? null : "search"));
      } else if (intent === "shortcuts") {
        e.preventDefault();
        setOpen("shortcuts");
      } else if (intent === "chord-start") {
        chordUntil.current = Date.now() + CHORD_WINDOW_MS;
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [router, open]);

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        aria-keyshortcuts="Control+K Meta+K /"
        onClick={() => setOpen("search")}
        className="text-muted-foreground"
      >
        <Search aria-hidden />
        <span className="sr-only sm:not-sr-only">Search</span>
        <kbd className="hidden rounded border px-1 font-mono text-[10px] sm:inline">Ctrl K</kbd>
      </Button>
      {open ? (
        <Suspense fallback={null}>
          <Palette mode={open} onClose={close} onShowShortcuts={() => setOpen("shortcuts")} />
        </Suspense>
      ) : null}
    </>
  );
}
