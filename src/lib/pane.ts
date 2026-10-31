/** Sizes and layout for a list with its record pane beside it (xl and wider). Plain values, usable on the server and in the browser. */
export const PANE_MIN_REM = 22;
export const PANE_MAX_REM = 48;
export const PANE_DEFAULT_REM = 30;

/** Whole and half rems only, inside the allowed range, so a drag and the arrow keys always land on the same widths. */
export const clampPane = (rem: number) => Math.min(PANE_MAX_REM, Math.max(PANE_MIN_REM, Math.round(rem * 2) / 2));

/** The grid wherever a list sits beside a record: the list, a thin divider, then the record at the chosen width (`--pane-w`). */
export const SPLIT_GRID = "xl:grid xl:grid-cols-[minmax(0,1fr)_0.75rem_var(--pane-w)] xl:items-start";
