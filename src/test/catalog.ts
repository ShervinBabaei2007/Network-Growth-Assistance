import type { Catalog } from "@/lib/domain";

/**
 * A user's own schools and disciplines, for tests. They're ordinary user-defined entries
 * (any names would do); short ids keep the tests readable.
 */
export const TEST_CATALOG: Catalog = {
  universities: [
    { id: "uoft", name: "University of Toronto", aliases: ["U of T", "UofT", "utoronto"], hasTargets: true, position: 0 },
    { id: "ubc", name: "UBC", aliases: ["University of British Columbia", "UBC Vancouver"], hasTargets: true, position: 1 },
    { id: "sfu", name: "SFU", aliases: ["Simon Fraser University", "Simon Fraser"], hasTargets: false, position: 2 },
    { id: "waterloo", name: "University of Waterloo", aliases: ["uwaterloo"], hasTargets: false, position: 3 },
  ],
  disciplines: [
    { id: "ce", name: "Computer Engineering", aliases: ["comp eng", "CompEng", "cpen"], position: 0 },
    { id: "ee", name: "Electrical Engineering", aliases: ["elec eng"], position: 1 },
    { id: "mech", name: "Mechatronics Engineering", aliases: ["mechatronics"], position: 2 },
    { id: "cs", name: "Computer Science", aliases: ["cpsc", "cmpt", "computing science"], position: 3 },
  ],
};

/** The same catalog with its disciplines in another priority order. */
export const withPriority = (order: string[], catalog: Catalog = TEST_CATALOG): Catalog => ({
  ...catalog,
  disciplines: order.map((id, position) => ({ ...catalog.disciplines.find((d) => d.id === id)!, position })),
});

/** A user in a different field entirely, to show nothing is engineering-specific. */
export const NURSING_CATALOG: Catalog = {
  universities: [{ id: "mcgill", name: "McGill University", aliases: ["McGill"], hasTargets: true, position: 0 }],
  disciplines: [{ id: "nursing", name: "Nursing", aliases: ["BSN", "BScN"], position: 0 }],
};
