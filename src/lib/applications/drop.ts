import { isClosed, OPEN_STAGES, STAGE_LABEL, type Stage } from "./stages";

/**
 * What dropping a card on a board column means. Each open stage is its own column, so that's a move. The Closed
 * column holds four different outcomes, so dropping there asks the person to pick one with the card's stage menu
 * instead of guessing (rejected? withdrawn?). A card dropped where it already is changes nothing.
 */
export type DropOutcome = { kind: "move"; to: Stage } | { kind: "hint"; message: string } | { kind: "none" };

export function dropOutcome(column: string, current: Stage): DropOutcome {
  if ((OPEN_STAGES as readonly string[]).includes(column)) {
    const to = column as Stage;
    return to === current ? { kind: "none" } : { kind: "move", to };
  }
  if (column === "closed") {
    if (isClosed(current)) return { kind: "none" };
    return { kind: "hint", message: "Use the stage menu on the card to say how it closed: Accepted, Rejected, Withdrawn or No response." };
  }
  return { kind: "none" };
}

/** The column's name as a screen reader should hear it. */
export function columnLabel(column: string): string {
  return column === "closed" ? "Closed" : ((STAGE_LABEL as Record<string, string>)[column] ?? column);
}

/** The sentence a screen reader hears while a card is dragged. */
export function dragAnnouncement(title: string, from: Stage, column: string | null): string {
  if (!column) return `${title}, ${STAGE_LABEL[from]}, is not over a column.`;
  return `${title} is over ${columnLabel(column)}.`;
}
