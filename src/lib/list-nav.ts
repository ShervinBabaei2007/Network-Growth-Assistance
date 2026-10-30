/** Which row an arrow key moves to in a list of rows: one step, stopping at the ends (no wrap, so Up at the top stays put). */
export function nextRowIndex(current: number, count: number, key: string): number | null {
  if (count <= 0) return null;
  if (key === "ArrowDown") return Math.min(count - 1, current < 0 ? 0 : current + 1);
  if (key === "ArrowUp") return Math.max(0, current < 0 ? 0 : current - 1);
  if (key === "Home") return 0;
  if (key === "End") return count - 1;
  return null;
}

/** The width from which a record opens beside its list instead of replacing it (Tailwind's `xl`). */
export const SPLIT_MIN_WIDTH = 1280;
