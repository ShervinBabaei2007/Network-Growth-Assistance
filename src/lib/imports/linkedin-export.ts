import { normalizeProfileUrl } from "@/lib/linkedin/normalize-url";
import { findHeaderRow, parseCsv } from "./csv";

/**
 * Parsers for LinkedIn's official "Get a copy of your data" export.
 * Email addresses in Connections.csv are never read.
 */

export type ExportConnection = {
  key: string;
  url: string;
  fullName: string;
  company: string;
  position: string;
  /** YYYY-MM-DD, or null if LinkedIn left it blank or used an unknown format. */
  connectedOn: string | null;
};

export type ExportInvitation = {
  key: string;
  url: string;
  /** The other person's name as LinkedIn shows it. */
  name: string;
  /** Local date-time "YYYY-MM-DDTHH:mm", interpreted in the user's time zone later. */
  sentAtLocal: string | null;
  message: string;
};

const MONTHS: Record<string, string> = {
  jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
  jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12",
};

/** "09 Oct 2026", "9 Oct 2026", "2026-10-09" or "10/9/2026" → "2026-10-09". */
export function parseExportDate(text: string): string | null {
  const t = text.trim();
  let m = t.match(/^(\d{1,2})\s+([A-Za-z]{3})[a-z]*\s+(\d{4})$/);
  if (m && MONTHS[m[2].toLowerCase()]) return `${m[3]}-${MONTHS[m[2].toLowerCase()]}-${m[1].padStart(2, "0")}`;
  m = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
  if (m) return `${m[3].length === 2 ? `20${m[3]}` : m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;
  return null;
}

/** "10/9/26, 3:04 PM" (US month/day) → "2026-10-09T15:04". */
export function parseExportDateTime(text: string): string | null {
  const m = text.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4}),?\s+(\d{1,2}):(\d{2})\s*([AaPp][Mm])?$/);
  if (!m) {
    const d = parseExportDate(text);
    return d ? `${d}T12:00` : null;
  }
  let hour = Number(m[4]);
  const ampm = m[6]?.toLowerCase();
  if (ampm === "pm" && hour < 12) hour += 12;
  if (ampm === "am" && hour === 12) hour = 0;
  const year = m[3].length === 2 ? `20${m[3]}` : m[3];
  return `${year}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}T${String(hour).padStart(2, "0")}:${m[5]}`;
}

function columns(header: string[]) {
  const idx = (name: string) => header.findIndex((h) => h.trim().toLowerCase() === name.toLowerCase());
  return idx;
}

export function parseConnectionsCsv(text: string): { rows: ExportConnection[]; skipped: number; error?: string } {
  const all = parseCsv(text);
  const h = findHeaderRow(all, ["First Name", "URL"]);
  if (h === -1) return { rows: [], skipped: 0, error: "This doesn't look like LinkedIn's Connections.csv (no First Name / URL columns)." };
  const idx = columns(all[h]);
  const col = { first: idx("First Name"), last: idx("Last Name"), url: idx("URL"), company: idx("Company"), position: idx("Position"), on: idx("Connected On") };

  const rows: ExportConnection[] = [];
  const seen = new Set<string>();
  let skipped = 0;
  for (const r of all.slice(h + 1)) {
    const url = normalizeProfileUrl(r[col.url] ?? "");
    // Members who restrict visibility appear without a URL; they still count toward the total.
    if (!url.ok || seen.has(url.key)) {
      skipped++;
      continue;
    }
    seen.add(url.key);
    rows.push({
      key: url.key,
      url: url.url,
      fullName: [r[col.first], r[col.last]].map((s) => (s ?? "").trim()).filter(Boolean).join(" ") || url.key,
      company: col.company >= 0 ? (r[col.company] ?? "").trim() : "",
      position: col.position >= 0 ? (r[col.position] ?? "").trim() : "",
      connectedOn: col.on >= 0 ? parseExportDate(r[col.on] ?? "") : null,
    });
  }
  return { rows, skipped };
}

/** Outgoing invitations only; incoming ones are other people inviting you. */
export function parseInvitationsCsv(text: string): { rows: ExportInvitation[]; incoming: number; error?: string } {
  const all = parseCsv(text);
  const h = findHeaderRow(all, ["Direction", "Sent At"]);
  if (h === -1) return { rows: [], incoming: 0, error: "This doesn't look like LinkedIn's Invitations.csv (no Direction / Sent At columns)." };
  const idx = columns(all[h]);
  const col = { to: idx("To"), at: idx("Sent At"), message: idx("Message"), dir: idx("Direction"), invitee: idx("inviteeProfileUrl") };

  const rows: ExportInvitation[] = [];
  let incoming = 0;
  for (const r of all.slice(h + 1)) {
    if ((r[col.dir] ?? "").trim().toUpperCase() !== "OUTGOING") {
      incoming++;
      continue;
    }
    const url = normalizeProfileUrl(col.invitee >= 0 ? (r[col.invitee] ?? "") : "");
    if (!url.ok) continue;
    rows.push({
      key: url.key,
      url: url.url,
      name: col.to >= 0 ? (r[col.to] ?? "").trim() : "",
      sentAtLocal: parseExportDateTime(r[col.at] ?? ""),
      message: col.message >= 0 ? (r[col.message] ?? "").trim() : "",
    });
  }
  return { rows, incoming };
}

export type KnownCandidate = {
  id: string;
  status: string;
  invitation: "none" | "pending" | "resolved";
};

export type ExportPlan = {
  /** Invitations to record from Invitations.csv (person is a candidate with none recorded). */
  recordSent: { candidateId: string; sentAtLocal: string | null; message: string }[];
  /** Pending invitations that LinkedIn now shows as connections. */
  resolveAccepted: { candidateId: string; connectedOn: string | null }[];
  /** Candidates with no invitation who are connected anyway. */
  markConnected: { candidateId: string; connectedOn: string | null; preexisting: boolean }[];
  /** Connections made since the project start that aren't candidates yet. */
  newConnections: ExportConnection[];
  /** Pending in the app but not in LinkedIn's pending list and not connected: outcome unknown. */
  pendingMissingFromExport: number;
  totalConnections: number | null;
};

/** Decides what an export means for the user's records. Pure; nothing is written here. */
export function planExportImport(input: {
  connections: ExportConnection[] | null;
  connectionsSkipped: number;
  invitations: ExportInvitation[] | null;
  known: Map<string, KnownCandidate>;
  projectStartDate: string;
}): ExportPlan {
  const plan: ExportPlan = {
    recordSent: [],
    resolveAccepted: [],
    markConnected: [],
    newConnections: [],
    pendingMissingFromExport: 0,
    totalConnections: input.connections ? input.connections.length + input.connectionsSkipped : null,
  };
  const connectedKeys = new Set(input.connections?.map((c) => c.key) ?? []);
  const sentNow = new Set<string>();

  for (const inv of input.invitations ?? []) {
    const k = input.known.get(inv.key);
    if (!k || k.invitation !== "none" || ["do_not_contact", "not_a_match"].includes(k.status)) continue;
    plan.recordSent.push({ candidateId: k.id, sentAtLocal: inv.sentAtLocal, message: inv.message });
    sentNow.add(inv.key);
  }

  for (const c of input.connections ?? []) {
    const k = input.known.get(c.key);
    if (!k) {
      if (c.connectedOn && c.connectedOn >= input.projectStartDate) plan.newConnections.push(c);
      continue;
    }
    if (k.invitation === "pending" || sentNow.has(c.key)) {
      plan.resolveAccepted.push({ candidateId: k.id, connectedOn: c.connectedOn });
    } else if (k.invitation === "none" && k.status !== "connected") {
      plan.markConnected.push({
        candidateId: k.id,
        connectedOn: c.connectedOn,
        // Without a date we can't show it's new, so it isn't counted.
        preexisting: !c.connectedOn || c.connectedOn < input.projectStartDate,
      });
    }
  }

  if (input.invitations) {
    const stillPending = new Set(input.invitations.map((i) => i.key));
    for (const [key, k] of input.known) {
      if (k.invitation === "pending" && !stillPending.has(key) && !connectedKeys.has(key)) plan.pendingMissingFromExport++;
    }
  }
  return plan;
}
