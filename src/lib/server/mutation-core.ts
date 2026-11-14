import { z } from "zod";
import { err, ok, type ActionResult } from "@/lib/action-result";
import type { MessageKey, Params, Translator } from "@/lib/i18n/core";
import type { FormState } from "@/lib/form-state";
import type { Json } from "@/lib/supabase/database.types";

/**
 * A server action's whole lifecycle in one place: check the ids, open the signed-in context, run the
 * change, turn what happened into a message in the person's language, log it and refresh the page.
 * Callers supply only the change itself and say how it ended (`done` or `fail`).
 *
 * This file holds no framework imports, so tests drive it with their own dependencies. `mutation.ts`
 * wires the real ones.
 */

/** Text that is already final (for example a reason a library produced). Everything else is a catalogue key. */
export type Verbatim = { verbatim: string };
export const verbatim = (text: string): Verbatim => ({ verbatim: text });
/** A catalogue key, final text, or a sentence put together from several keys ("3 marked sent. 1 skipped."). */
type Message = MessageKey | Verbatim | ((t: Translator) => string);

type PgError = { code?: string } | null | undefined;
type Log = [kind: string, payload?: { [key: string]: Json | undefined }];

export type Outcome<T = undefined> =
  | { ok: true; message?: Message; params?: Params; data?: T; log?: Log }
  | { ok: false; message: Message; params?: Params; refresh?: boolean };

/** The change worked. `log` goes to the activity log (ids and counts only); the page refreshes after. */
export const done = <T = undefined>(message?: Message, extra: { params?: Params; data?: T; log?: Log } = {}): Outcome<T> => ({ ok: true, message, ...extra });

/**
 * The change did not happen. `byCode` swaps in a specific message for a Postgres error code. `refresh` still refreshes the
 * page, for a failure that means the page is out of date (rows changed in another tab).
 */
export const fail = (message: Message, extra: { params?: Params; error?: PgError; byCode?: Partial<Record<string, Message>>; refresh?: boolean } = {}): Outcome<never> => {
  const code = extra.error?.code;
  return { ok: false, message: (code && extra.byCode?.[code]) || message, params: extra.params, refresh: extra.refresh };
};

export type MutationDeps<Ctx> = {
  context: () => Promise<Ctx>;
  translator: () => Promise<Translator>;
  refresh: () => void;
  log: (ctx: Ctx, kind: string, payload?: { [key: string]: Json | undefined }) => Promise<void>;
};

export type MutationSpec = {
  /** Every one must be a UUID, or nothing runs and `notFound` is the answer. */
  ids?: readonly unknown[];
  notFound?: MessageKey;
  /** False for a change the page does not show (a click record, a draft). */
  refresh?: boolean;
};

const uuid = z.uuid();
export const isUuid = (value: unknown): value is string => uuid.safeParse(value).success;

export function createMutate<Ctx>(deps: MutationDeps<Ctx>) {
  return async function mutate<T = undefined>(spec: MutationSpec, run: (scope: { ctx: Ctx; ids: string[] }) => Promise<Outcome<T>>): Promise<ActionResult<T>> {
    const say = async (m: Message, params?: Params) => (typeof m === "string" ? (await deps.translator())(m, params) : typeof m === "function" ? m(await deps.translator()) : m.verbatim);
    const ids = spec.ids ?? [];
    if (!ids.every(isUuid)) return err(await say(spec.notFound ?? "mutation.notFound"));
    const ctx = await deps.context();
    const outcome = await run({ ctx, ids: [...ids] as string[] });
    if (!outcome.ok) {
      if (outcome.refresh) deps.refresh();
      return err(await say(outcome.message, outcome.params));
    }
    if (outcome.log) await deps.log(ctx, outcome.log[0], outcome.log[1]);
    if (spec.refresh !== false) deps.refresh();
    return ok<T>(outcome.message ? await say(outcome.message, outcome.params) : undefined, outcome.data === undefined ? {} : { data: outcome.data });
  };
}

/** For forms: the same result in the shape `useActionState` wants. */
export const toFormState = (r: ActionResult<unknown>): FormState => (r.ok ? { status: "saved", message: r.message } : { status: "error", message: r.error });
