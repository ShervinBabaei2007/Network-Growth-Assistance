import { z } from "zod";
import { groupBy } from "@/lib/bulk";
import type { MessageKey, Translator } from "@/lib/i18n/core";
import { MAX_SELECTION } from "@/lib/selection";
import { fail, type Outcome } from "./mutation-core";

/**
 * The parts every bulk change shares, on top of the mutation module: reading the ticked rows from the request, saying how
 * many were skipped, and undoing a change only where nothing has touched the rows since. A bulk action keeps its own rule
 * for which rows are eligible and what changes.
 */

const SELECTION = {
  people: { empty: "candidatesPage.bulkSelectEmpty", tooMany: "bulkChange.tooManyPeople" },
  applications: { empty: "applicationsPage.selectAtLeast", tooMany: "bulkChange.tooManyApplications" },
} as const satisfies Record<string, { empty: MessageKey; tooMany: MessageKey }>;

const uuids = z.array(z.uuid());

/**
 * The ticked ids, or the failure to return. Between 1 and 200 distinct-looking UUIDs; anything else says how to fix the
 * selection in the person's language.
 */
export function selectedIds(raw: unknown, noun: keyof typeof SELECTION): string[] | Outcome<never> {
  const parsed = uuids.safeParse(raw);
  if (!parsed.success || parsed.data.length === 0) return fail(SELECTION[noun].empty);
  if (parsed.data.length > MAX_SELECTION) return fail(SELECTION[noun].tooMany, { params: { max: MAX_SELECTION } });
  return parsed.data;
}

/** "{done}" then ". {n} skipped." when some rows were skipped, or just "." */
export const withSkipped = (t: Translator, done: string, skipped: number, skippedKey: MessageKey): string => `${done}${skipped ? t(skippedKey, { count: skipped }) : "."}`;

/**
 * Puts rows back to what they were, one update per distinct previous value. `restore` should only touch rows that still
 * hold the value the change gave them, so a row someone else changed since is left alone. Stops at the first failure and
 * says so (false); true when every group was restored.
 */
export async function restoreByPrevious<P>(changed: readonly { id: string; previous: P }[], restore: (previous: P, ids: string[]) => PromiseLike<{ error: unknown }>): Promise<boolean> {
  for (const [previous, ids] of groupBy(changed, (c) => c.previous, (c) => c.id)) {
    const { error } = await restore(previous, ids);
    if (error) return false;
  }
  return true;
}
