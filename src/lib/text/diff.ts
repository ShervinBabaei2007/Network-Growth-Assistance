/**
 * A line diff (longest common subsequence), for comparing resume versions side by side.
 * Small inputs only (resumes are a few hundred lines), so the O(n·m) table is fine.
 */

export type DiffOp = { type: "same" | "add" | "del"; text: string };

const MAX_LINES = 1500;

export function diffLines(before: string, after: string): DiffOp[] {
  const a = before.split("\n").slice(0, MAX_LINES);
  const b = after.split("\n").slice(0, MAX_LINES);
  const key = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();
  const n = a.length;
  const m = b.length;
  const table: Uint16Array[] = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) table[i][j] = key(a[i]) === key(b[j]) ? table[i + 1][j + 1] + 1 : Math.max(table[i + 1][j], table[i][j + 1]);
  }
  const out: DiffOp[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (key(a[i]) === key(b[j])) {
      out.push({ type: "same", text: b[j] });
      i++;
      j++;
    } else if (table[i + 1][j] >= table[i][j + 1]) out.push({ type: "del", text: a[i++] });
    else out.push({ type: "add", text: b[j++] });
  }
  while (i < n) out.push({ type: "del", text: a[i++] });
  while (j < m) out.push({ type: "add", text: b[j++] });
  return out;
}

export function diffStats(ops: DiffOp[]): { added: number; removed: number; same: number } {
  return { added: ops.filter((o) => o.type === "add").length, removed: ops.filter((o) => o.type === "del").length, same: ops.filter((o) => o.type === "same").length };
}
