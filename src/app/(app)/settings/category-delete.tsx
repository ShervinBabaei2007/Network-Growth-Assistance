"use client";

import { Trash2 } from "lucide-react";
import { deleteCategory } from "@/app/(app)/actions";
import { useActionRunner } from "@/components/toast/use-action-runner";
import { Button } from "@/components/ui/button";

/** Removes one of the user's schools or disciplines, after they confirm (its candidates go back to review). */
export function DeleteCategoryButton({ kind, id, name }: { kind: "university" | "discipline"; id: string; name: string }) {
  const { pending, run } = useActionRunner();
  return (
    <Button
      type="button"
      size="sm"
      variant="ghost"
      disabled={pending}
      aria-label={`Remove ${name}`}
      onClick={() => {
        if (window.confirm(`Remove “${name}”? Candidates matched to it go back to review, and its targets are removed.`)) run(() => deleteCategory(kind, id));
      }}
    >
      <Trash2 aria-hidden />
      Remove
    </Button>
  );
}
