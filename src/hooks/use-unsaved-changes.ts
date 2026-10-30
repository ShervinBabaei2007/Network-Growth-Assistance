"use client";

import { useEffect } from "react";

export const UNSAVED_MESSAGE = "You have unsaved changes. Leave this page and lose them?";

/**
 * While `dirty` is true, closing or reloading the tab asks first (the browser's own prompt), and so does clicking a
 * link that leaves the page. Next.js has no navigation events to hook, so links are caught in the capture phase,
 * before the router sees the click. The browser's Back button is not intercepted.
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
      const to = new URL(link.href, location.href);
      if (to.origin !== location.origin) return;
      // A link to this same page (or a hash on it) does not lose anything.
      if (to.pathname === location.pathname && to.search === location.search) return;
      if (!window.confirm(message)) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    window.addEventListener("beforeunload", beforeUnload);
    document.addEventListener("click", onClick, true);
    return () => {
      window.removeEventListener("beforeunload", beforeUnload);
      document.removeEventListener("click", onClick, true);
    };
  }, [dirty, message]);
}
