/**
 * Minimal RFC 4180 CSV parser: quoted fields, escaped quotes (""), commas and
 * newlines inside quotes, CRLF or LF line endings, and a leading byte-order mark.
 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;

  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"' && field === "") {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += ch;
    }
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  // Drop blank lines.
  return rows.filter((r) => r.some((cell) => cell.trim() !== ""));
}

/** Index of the first row whose cells include every required header (case-insensitive). */
export function findHeaderRow(rows: string[][], required: string[]): number {
  const want = required.map((h) => h.toLowerCase());
  return rows.findIndex((r) => {
    const cells = r.map((c) => c.trim().toLowerCase());
    return want.every((h) => cells.includes(h));
  });
}
