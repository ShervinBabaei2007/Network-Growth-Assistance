import { normalizeProfileUrl } from "@/lib/linkedin/normalize-url";
import { normalizeName, splitName } from "@/lib/text/names";
import { parseConnections, type ColumnMapping, type KnownConnectionInput } from "./csv";

/**
 * Where a user's known 1st-degree connections come from. Every source returns the
 * same normalized rows; the import action decides what to insert or update.
 *
 * Implementations:
 * - CsvConnectionSource: an uploaded CSV (LinkedIn's Connections.csv or any contact list).
 * - ManualConnectionSource: one person typed in by the user.
 * - A LinkedIn API source could be added only through an approved LinkedIn partner
 *   integration. There is deliberately no implementation that reads LinkedIn otherwise.
 */
export interface ConnectionSource {
  readonly kind: "csv" | "manual" | "linkedin_export";
  importConnections(userId: string): Promise<KnownConnectionInput[]>;
}

export class CsvConnectionSource implements ConnectionSource {
  readonly kind: "csv" | "linkedin_export";
  private readonly parsed;

  constructor(text: string, mapping?: Partial<ColumnMapping>) {
    this.parsed = parseConnections(text, mapping);
    this.kind = this.parsed.isLinkedInExport ? "linkedin_export" : "csv";
  }

  get error() {
    return this.parsed.error;
  }

  get summary() {
    const { skipped, duplicatesInFile, rows } = this.parsed;
    return { rows: rows.length, skipped, duplicatesInFile };
  }

  async importConnections(): Promise<KnownConnectionInput[]> {
    return this.parsed.rows;
  }
}

export class ManualConnectionSource implements ConnectionSource {
  readonly kind = "manual" as const;

  constructor(
    private readonly input: { fullName: string; company?: string | null; position?: string | null; linkedinUrl?: string | null; connectedOn?: string | null },
  ) {}

  async importConnections(): Promise<KnownConnectionInput[]> {
    const fullName = this.input.fullName.trim().replace(/\s+/g, " ");
    const normalizedName = normalizeName(fullName);
    if (!normalizedName) return [];
    const url = this.input.linkedinUrl ? normalizeProfileUrl(this.input.linkedinUrl) : null;
    const split = splitName(fullName);
    return [
      {
        fullName,
        firstName: split.first,
        lastName: split.last,
        normalizedName,
        company: this.input.company?.trim() || null,
        position: this.input.position?.trim() || null,
        linkedinUrl: url?.ok ? url.url : null,
        linkedinKey: url?.ok ? url.key : null,
        connectedOn: this.input.connectedOn || null,
      },
    ];
  }
}
