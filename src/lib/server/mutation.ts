import "server-only";
import { refresh } from "next/cache";
import { getT } from "@/lib/i18n/server";
import { actionContext, logActivity } from "./action-context";
import { createMutate } from "./mutation-core";

export { done, fail, toFormState, verbatim } from "./mutation-core";

/** Runs one server action's change with the real database, language, page refresh and activity log. */
export const mutate = createMutate({ context: actionContext, translator: getT, refresh: () => refresh(), log: logActivity });
