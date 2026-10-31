"use client";

import { useEffect } from "react";
import { leavesPage } from "@/lib/leaves-page";

export const UNSAVED_MESSAGE = "You have unsaved changes. Leave this page and lose them?";

/**
 * While `dirty` is true, closing or reloading the tab asks first (the browser's own prompt), and so does clicking a
 * link that leaves the page. Next.js has no navigation events to hook, so links are caught in the capture phase,
 * before the router sees the click.
 *
 * The Back button is handled with a spare history entry: when the form becomes dirty the current entry is pushed
 * again (same URL, same state, so the router is undisturbed). Back then only removes the spare entry and fires
 * `popstate`, where we ask; "stay" puts the spare back, "leave" goes back for real. After the form is saved the
 * spare entry stays, so one extra Back press is needed to leave: the cost of not breaking the router.
 */
export function useUnsavedChanges(dirty: boolean, message = UNSAVED_MESSAGE) {
  useEffect(() => {
    if (!dirty) return;
    const beforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const link = e.target instanceof Element ? e.target.closest<HTMLAnchorElement>("a[href]") : null;
      if (!link || (link.target && link.target !== "_self") || link.hasAttribute("download")) return;
      // Other sites, this same page (or a hash on it) and file downloads keep the page open: nothing is lost.
      if (!leavesPage(new URL(link.href, location.href), location)) return;
      if (!window.confirm(message)) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    const spare = () => history.pushState(history.state, "", location.href);
    let leaving = false;
    const onPopState = (e: PopStateEvent) => {
      if (leaving) return;
      // Ours runs first (capture phase, same target), so the router never sees a Back we are about to refuse.
      e.stopImmediatePropagation();
      if (window.confirm(message)) {
        leaving = true;
        history.back();
      } else {
        spare();
      }
    };
    spare();
    window.addEventListener("beforeunload", beforeUnload);
    window.addEventListener("popstate", onPopState, true);
    document.addEventListener("click", onClick, true);
    return () => {
      window.removeEventListener("beforeunload", beforeUnload);
      window.removeEventListener("popstate", onPopState, true);
      document.removeEventListener("click", onClick, true);
    };
  }, [dirty, message]);
}
