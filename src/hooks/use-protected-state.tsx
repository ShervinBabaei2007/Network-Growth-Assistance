"use client";

import type { ReactNode } from "react";
import { DraftBanner } from "@/components/draft-banner";
import { useDraft } from "@/hooks/use-draft";
import { useUnsavedChanges } from "@/hooks/use-unsaved-changes";

/**
 * For an editor that keeps one object in state: warns before leaving with unsaved edits, keeps a draft in this browser,
 * and returns a banner to render at the top of the editor when a draft from an earlier visit is waiting.
 *
 * `saved` is what the server has (the editor's props); `restore` puts a stored draft back in state, and `isValid`
 * checks its shape first so damaged storage can never put the editor in a broken state.
 */
export function useProtectedState<T>(key: string, value: T, saved: T, restore: (draft: T) => void, isValid: (draft: unknown) => draft is T): ReactNode {
  const json = JSON.stringify(value);
  const savedJson = JSON.stringify(saved);
  useUnsavedChanges(json !== savedJson);
  const draft = useDraft(key, json, savedJson);
  if (draft.offered === null) return null;
  return (
    <DraftBanner
      what="edit"
      onRestore={() => {
        const raw = draft.accept();
        try {
          const parsed: unknown = raw === null ? null : JSON.parse(raw);
          if (isValid(parsed)) restore(parsed);
        } catch {
          // A draft that cannot be read is dropped; the saved version stays.
        }
      }}
      onDiscard={draft.discard}
    />
  );
}
