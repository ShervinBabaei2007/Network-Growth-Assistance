import { parseCsv } from "@/lib/imports/csv";
import { parseExportDate } from "@/lib/imports/linkedin-export";
import { normalizeProfileUrl } from "@/lib/linkedin/normalize-url";
import { normalizeName, splitName } from "@/lib/text/names";

/**
 * Parses a connections CSV, either LinkedIn's own Connections.csv export or any
 * other contact list, into known 1st-degree connections. Email addresses are
 * recognized so the mapping preview can show them, but they are never returned.
 */

export const CONNECTION_FIELDS = ["fullName", "firstName", "lastName", "company", "position", "email", "connectedOn", "linkedinUrl"] as const;
export type ConnectionField = (typeof CONNECTION_FIELDS)[number];
/** Column index per field, or -1 when the file has no such column. */
export type ColumnMapping = Record<ConnectionField, number>;

export const FIELD_LABELS: Record<ConnectionField, string> = {
  fullName: "Full name",
  firstName: "First name",
  lastName: "Last name",
  company: "Company",
  position: "Position",
  email: "Email (not stored)",
  connectedOn: "Connected on",
  linkedinUrl: "LinkedIn URL",
};

const HEADER_ALIASES: Record<ConnectionField, readonly string[]> = {
  fullName: ["full name", "name", "contact name", "display name"],
  firstName: ["first name", "firstname", "given name", "first"],
  lastName: ["last name", "lastname", "surname", "family name", "last"],
  company: ["company", "organization", "organisation", "employer", "company name"],
  position: ["position", "title", "job title", "role", "headline"],
  email: ["email address", "email", "e-mail", "email 1"],
  connectedOn: ["connected on", "connected", "date connected", "connection date"],
  linkedinUrl: ["url", "linkedin url", "profile url", "linkedin", "linkedin profile"],
};

export type KnownConnectionInput = {
  fullName: string;
  firstName: string | null;
  lastName: string | null;
  normalizedName: string;
  company: string | null;
  position: string | null;
  linkedinUrl: string | null;
  linkedinKey: string | null;
  connectedOn: string | null;
};

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

/** Guesses which column holds each field from the header names. */
export function guessMapping(header: string[]): ColumnMapping {
  const cells = header.map(norm);
  const used = new Set<number>();
  const mapping = Object.fromEntries(CONNECTION_FIELDS.map((f) => [f, -1])) as ColumnMapping;
  for (const field of CONNECTION_FIELDS) {
    for (const alias of HEADER_ALIASES[field]) {
      const i = cells.findIndex((c, idx) => c === alias && !used.has(idx));
      if (i !== -1) {
        mapping[field] = i;
        used.add(i);
        break;
      }
    }
  }
  return mapping;
}

/**
 * Finds the header row. LinkedIn's export starts with a few "Notes:" lines, so the
 * first row that names a person column (and has 2+ columns) is the header.
 */
export function findConnectionsHeader(rows: string[][]): number {
  return rows.findIndex((r) => {
    if (r.length < 2) return false;
    const m = guessMapping(r);
    return m.fullName !== -1 || m.firstName !== -1;
  });
}

export type ParsedConnections = {
  header: string[];
  mapping: ColumnMapping;
  /** First rows as raw cells, for the mapping preview. */
  sample: string[][];
  rows: KnownConnectionInput[];
  /** Rows without a usable name. */
  skipped: number;
  /** Rows repeated inside the same file. */
  duplicatesInFile: number;
  isLinkedInExport: boolean;
  error?: string;
};

const cell = (r: string[], i: number) => (i >= 0 ? (r[i] ?? "").trim() : "");
const orNull = (s: string) => (s ? s : null);

/** Identity used to spot the same connection twice: LinkedIn slug, else name + company. */
export function connectionKey(c: Pick<KnownConnectionInput, "linkedinKey" | "normalizedName" | "company">): string {
  if (c.linkedinKey) return `li:${c.linkedinKey}`;
  return `nm:${c.normalizedName}|${norm(c.company ?? "")}`;
}

export function parseConnections(text: string, mappingOverride?: Partial<ColumnMapping>): ParsedConnections {
  const all = parseCsv(text);
  // Without recognizable headers, a chosen name column means the first table row is the header.
  const chosen = mappingOverride && ((mappingOverride.fullName ?? -1) >= 0 || (mappingOverride.firstName ?? -1) >= 0);
  let h = findConnectionsHeader(all);
  if (h === -1 && chosen) h = all.findIndex((r) => r.length >= 2);
  const empty = { header: [], mapping: guessMapping([]), sample: [], rows: [], skipped: 0, duplicatesInFile: 0, isLinkedInExport: false };
  if (h === -1) return { ...empty, error: "Couldn't find a header row with a name column (for example First Name or Name)." };

  const header = all[h];
  const mapping = { ...guessMapping(header), ...mappingOverride };
  if (mapping.fullName === -1 && mapping.firstName === -1) {
    return { ...empty, header, mapping, error: "Choose which column holds the name." };
  }
  const body = all.slice(h + 1);
  const lowered = header.map(norm);
  const isLinkedInExport = ["first name", "last name", "url", "connected on"].every((c) => lowered.includes(c));

  const rows: KnownConnectionInput[] = [];
  const seen = new Set<string>();
  let skipped = 0;
  let duplicatesInFile = 0;
  for (const r of body) {
    const first = cell(r, mapping.firstName);
    const last = cell(r, mapping.lastName);
    const fullName = (cell(r, mapping.fullName) || [first, last].filter(Boolean).join(" ")).replace(/\s+/g, " ").slice(0, 200);
    const normalizedName = normalizeName(fullName);
    if (!normalizedName) {
      skipped++;
      continue;
    }
    const url = normalizeProfileUrl(cell(r, mapping.linkedinUrl));
    const split = splitName(fullName);
    const row: KnownConnectionInput = {
      fullName,
      firstName: orNull(first) ?? split.first,
      lastName: orNull(last) ?? split.last,
      normalizedName,
      company: orNull(cell(r, mapping.company).slice(0, 200)),
      position: orNull(cell(r, mapping.position).slice(0, 300)),
      linkedinUrl: url.ok ? url.url : null,
      linkedinKey: url.ok ? url.key : null,
      connectedOn: parseExportDate(cell(r, mapping.connectedOn)),
    };
    const key = connectionKey(row);
    if (seen.has(key)) {
      duplicatesInFile++;
      continue;
    }
    seen.add(key);
    rows.push(row);
  }

  // The preview never shows emails, even raw.
  const sample = body.slice(0, 5).map((r) => r.map((v, i) => (i === mapping.email ? (v ? "•••" : "") : v)));
  return { header, mapping, sample, rows, skipped, duplicatesInFile, isLinkedInExport };
}

export type ExistingConnection = {
  id: string;
  linkedinKey: string | null;
  normalizedName: string;
  company: string | null;
  position: string | null;
  connectedOn: string | null;
};

export type ConnectionImportPlan = {
  insert: KnownConnectionInput[];
  /** Existing rows that the file adds details to (company, position, URL or date). */
  update: { id: string; changes: Partial<KnownConnectionInput> }[];
  /** Already stored with nothing new. */
  unchanged: number;
};

/** Decides what an import changes. Pure; nothing is written here. */
export function planConnectionImport(rows: KnownConnectionInput[], existing: ExistingConnection[]): ConnectionImportPlan {
  const byKey = new Map<string, ExistingConnection>();
  const byNameCompany = new Map<string, ExistingConnection>();
  for (const e of existing) {
    if (e.linkedinKey) byKey.set(e.linkedinKey, e);
    byNameCompany.set(connectionKey({ linkedinKey: null, normalizedName: e.normalizedName, company: e.company }), e);
  }

  const plan: ConnectionImportPlan = { insert: [], update: [], unchanged: 0 };
  for (const r of rows) {
    const match =
      (r.linkedinKey ? byKey.get(r.linkedinKey) : undefined) ??
      byNameCompany.get(connectionKey({ linkedinKey: null, normalizedName: r.normalizedName, company: r.company }));
    // A stored row with a different LinkedIn slug is a different person who shares the name.
    if (!match || (match.linkedinKey && r.linkedinKey && match.linkedinKey !== r.linkedinKey)) {
      plan.insert.push(r);
      continue;
    }
    const changes: Partial<KnownConnectionInput> = {};
    if (r.linkedinKey && !match.linkedinKey) Object.assign(changes, { linkedinKey: r.linkedinKey, linkedinUrl: r.linkedinUrl });
    if (r.company && r.company !== match.company) changes.company = r.company;
    if (r.position && r.position !== match.position) changes.position = r.position;
    if (r.connectedOn && !match.connectedOn) changes.connectedOn = r.connectedOn;
    if (Object.keys(changes).length) plan.update.push({ id: match.id, changes });
    else plan.unchanged++;
  }
  return plan;
}
