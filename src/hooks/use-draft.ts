"use client";

import { useCallback, useEffect, useState } from "react";
import { clearDraft, isDirty, loadDraft, saveDraft } from "@/lib/drafts";

/**
 * Keeps what is being typed as a draft in this browser and offers it back after a crash or an accidental close.
 *
 * `value` is what is typed now and `saved` is what the server has. Once they differ the draft is stored (after a
 * short pause); once they match it is removed. On first load, a stored draft that differs from `saved` is offered
 * as `offered`; nothing is stored until the person restores or discards it, so the offer is never overwritten.
 */
export function useDraft(key: string, value: string, saved: string) {
  const [offered, setOffered] = useState<string | null>(null);
  const [decided, setDecided] = useState(false);

  // Look for a draft once per record. Browser storage can only be read after mount (reading it while rendering
  // would differ from the server's HTML), so the state is set from an effect on purpose.
  /* eslint-disable react-hooks/set-state-in-effect, react-hooks/exhaustive-deps -- `saved` is read once: a later save must not re-offer the draft it just replaced. */
  useEffect(() => {
    const draft = loadDraft(key);
    if (draft !== null && isDirty(draft, saved)) setOffered(draft);
    else if (draft !== null) clearDraft(key);
    setDecided(true);
  }, [key]);
  /* eslint-enable react-hooks/set-state-in-effect, react-hooks/exhaustive-deps */

  useEffect(() => {
    if (!decided || offered !== null) return;
    const timer = setTimeout(() => (isDirty(value, saved) ? saveDraft(key, value) : clearDraft(key)), 400);
    return () => clearTimeout(timer);
  }, [key, value, saved, decided, offered]);

  const accept = useCallback(() => {
    const draft = offered;
    setOffered(null);
    return draft;
  }, [offered]);
  const discard = useCallback(() => {
    clearDraft(key);
    setOffered(null);
  }, [key]);

  return { offered, accept, discard };
}
