import { fixtureBoard } from "../fixtures";
import { ashby, greenhouse, lever, recruitee, smartrecruiters, workable } from "./adapters";
import type { AtsAdapter, AtsKind } from "./types";

export const ADAPTERS: Record<Exclude<AtsKind, "fixture">, AtsAdapter> = { greenhouse, lever, ashby, smartrecruiters, workable, recruitee };

/** The adapter for a board. In fixture mode every board is served from canned data. */
export function adapterFor(kind: AtsKind): AtsAdapter {
  if (kind === "fixture" || process.env.JOBS_FIXTURES === "1") return fixtureBoard;
  return ADAPTERS[kind];
}

export const ATS_LABELS: Record<AtsKind, string> = {
  greenhouse: "Greenhouse",
  lever: "Lever",
  ashby: "Ashby",
  smartrecruiters: "SmartRecruiters",
  workable: "Workable",
  recruitee: "Recruitee",
  fixture: "Sample board",
};
