import { describe, expect, it } from "vitest";
import { translator } from "@/lib/i18n";
import type { Locale } from "@/lib/i18n";
import { createMutate, done, fail, toFormState, verbatim } from "./mutation-core";

const PERSON = "0b7c6c52-62a0-4d5b-9a0e-6d3c1f0a1111";

function setup(locale: Locale = "en") {
  const calls = { context: 0, refresh: 0, logs: [] as unknown[][] };
  const mutate = createMutate({
    context: async () => {
      calls.context++;
      return { userId: "u1" };
    },
    translator: async () => translator(locale),
    refresh: () => {
      calls.refresh++;
    },
    log: async (_ctx, kind, payload) => {
      calls.logs.push([kind, payload]);
    },
  });
  return { mutate, calls };
}

describe("mutate", () => {
  it("answers a bad id in the person's language without opening the context or running", async () => {
    const { mutate, calls } = setup("fr-CA");
    let ran = false;
    const r = await mutate({ ids: ["nope"], notFound: "mutation.personNotFound" }, async () => {
      ran = true;
      return done();
    });
    expect(r).toEqual({ ok: false, error: "Nous n'avons pas trouvé cette personne. Rechargez la page et réessayez." });
    expect(ran).toBe(false);
    expect(calls.context).toBe(0);
    expect(calls.refresh).toBe(0);
  });

  it("falls back to the generic not-found message", async () => {
    const r = await setup().mutate({ ids: [42] }, async () => done());
    expect(r).toEqual({ ok: false, error: "We couldn't find that. Reload the page and try again." });
  });

  it("hands the change its context and ids, then logs, refreshes and translates the message", async () => {
    const { mutate, calls } = setup("fr-CA");
    const r = await mutate({ ids: [PERSON] }, async ({ ctx, ids }) => {
      expect(ctx.userId).toBe("u1");
      expect(ids).toEqual([PERSON]);
      return done("personAction.saved", { log: ["network.person_saved", { person: PERSON }] });
    });
    expect(r).toEqual({ ok: true, message: "Ajoutée à Personnes." });
    expect(calls.logs).toEqual([["network.person_saved", { person: PERSON }]]);
    expect(calls.refresh).toBe(1);
  });

  it("returns data and fills message placeholders", async () => {
    const r = await setup().mutate<{ n: number }>({}, async () => done("peoplePage.countMany", { params: { count: 3 }, data: { n: 3 } }));
    expect(r).toEqual({ ok: true, message: "3 people", data: { n: 3 } });
  });

  it("succeeds without a message", async () => {
    const r = await setup().mutate({}, async () => done());
    expect(r).toEqual({ ok: true, message: undefined });
  });

  it("does not log or refresh when the change fails", async () => {
    const { mutate, calls } = setup();
    const r = await mutate({}, async () => fail("ui.saveFailed"));
    expect(r).toEqual({ ok: false, error: "Couldn't save. Try again." });
    expect(calls.logs).toEqual([]);
    expect(calls.refresh).toBe(0);
  });

  it("skips the refresh for a change the page does not show", async () => {
    const { mutate, calls } = setup();
    await mutate({ refresh: false }, async () => done("mutation.undone"));
    expect(calls.refresh).toBe(0);
  });

  it("picks the message for a Postgres error code, and the fallback otherwise", async () => {
    const byCode = { "23503": "companyAction.notYours" } as const;
    const { mutate } = setup();
    expect(await mutate({}, async () => fail("companyAction.recordFailed", { error: { code: "23503" }, byCode }))).toEqual({ ok: false, error: "That person or application isn't yours." });
    expect(await mutate({}, async () => fail("companyAction.recordFailed", { error: { code: "XX000" }, byCode }))).toEqual({ ok: false, error: "Couldn't record it. Try again." });
    expect(await mutate({}, async () => fail("companyAction.recordFailed", { error: null, byCode }))).toEqual({ ok: false, error: "Couldn't record it. Try again." });
  });

  it("builds a sentence from several keys when the message is a function", async () => {
    const r = await setup("fr-CA").mutate({}, async () => done((t) => `${t("mutation.undone")} ${t("mutation.unknownValue")}`));
    expect(r).toEqual({ ok: true, message: "Annulé. Valeur inconnue." });
  });

  it("refreshes after a failure only when the failure asks for it", async () => {
    const { mutate, calls } = setup();
    await mutate({}, async () => fail("mutation.undoFailed"));
    expect(calls.refresh).toBe(0);
    const r = await mutate({}, async () => fail("mutation.undoFailed", { refresh: true }));
    expect(r).toEqual({ ok: false, error: "Couldn't undo. Try again." });
    expect(calls.refresh).toBe(1);
    expect(calls.logs).toEqual([]);
  });

  it("passes verbatim text through untouched, on success and on failure", async () => {
    const { mutate } = setup("fr-CA");
    expect(await mutate({}, async () => done(verbatim("Already final.")))).toEqual({ ok: true, message: "Already final." });
    expect(await mutate({}, async () => fail(verbatim("Already final.")))).toEqual({ ok: false, error: "Already final." });
  });

  it("lets an error thrown by the change propagate (a redirect must not be swallowed)", async () => {
    const { mutate, calls } = setup();
    await expect(
      mutate({}, async () => {
        throw new Error("NEXT_REDIRECT");
      }),
    ).rejects.toThrow("NEXT_REDIRECT");
    expect(calls.refresh).toBe(0);
  });
});

describe("toFormState", () => {
  it("maps a result to the shape forms use", () => {
    expect(toFormState({ ok: true, message: "Saved." })).toEqual({ status: "saved", message: "Saved." });
    expect(toFormState({ ok: false, error: "No." })).toEqual({ status: "error", message: "No." });
  });
});
