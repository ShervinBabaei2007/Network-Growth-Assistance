import { fixtureBoard } from "../fixtures";
import { ashby, greenhouse, lever, recruitee, smartrecruiters, workable } from "./adapters";
import { jobFixturesEnabled } from "@/lib/runtime-mode";
import { BoardError, type AtsAdapter, type AtsKind } from "./types";

export const ADAPTERS: Record<Exclude<AtsKind, "fixture">, AtsAdapter> = { greenhouse, lever, ashby, smartrecruiters, workable, recruitee };

/**
 * The adapter for a board. In fixture mode (tests and local demos only) every board is
 * served from canned data. Outside it, sample boards are never read, so fictional jobs
 * can't reach real users even if sample employers are left in the database.
 */
export function adapterFor(kind: AtsKind): AtsAdapter {
  const fixtures = jobFixturesEnabled();
  if (kind === "fixture" && !fixtures) throw new BoardError("Sample boards are only read in test mode.");
  if (fixtures) return fixtureBoard;
  return ADAPTERS[kind as Exclude<AtsKind, "fixture">];
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
