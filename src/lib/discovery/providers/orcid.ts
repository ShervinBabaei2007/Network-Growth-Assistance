import { ProviderError, type OrcidAffiliation, type OrcidProfile, type SearchProvider, type SearchResult } from "./types";
import { BODY_LIMITS, readCappedJson } from "@/lib/net/read-capped";

/**
 * ORCID's public API (https://info.orcid.org/documentation/features/public-api/).
 * No key needed. People publish their own education (school, department, degree,
 * years) and employment (employer, title) as structured fields, so the record is
 * evidence without any AI reading.
 */

type Year = { year?: { value?: string } | null } | null;
type Summary = {
  "department-name": string | null;
  "role-title": string | null;
  "start-date": Year;
  "end-date": Year;
  organization: { name: string; address?: { city?: string | null; country?: string | null } | null };
};
type Group = { summaries?: Record<string, Summary>[] };
type OrcidRecord = {
  person?: {
    name?: { "given-names"?: { value?: string } | null; "family-name"?: { value?: string } | null; "credit-name"?: { value?: string } | null } | null;
    biography?: { content?: string | null } | null;
    "researcher-urls"?: { "researcher-url"?: { url?: { value?: string } }[] } | null;
    addresses?: { address?: { country?: { value?: string } | null }[] } | null;
  };
  "activities-summary"?: {
    educations?: { "affiliation-group"?: Group[] } | null;
    qualifications?: { "affiliation-group"?: Group[] } | null;
    employments?: { "affiliation-group"?: Group[] } | null;
  };
};
type ExpandedSearch = { "expanded-result"?: { "orcid-id": string }[] | null };

const year = (d: Year) => {
  const y = Number(d?.year?.value);
  return Number.isInteger(y) && y > 1900 ? y : null;
};

function affiliations(groups: Group[] | undefined): OrcidAffiliation[] {
  return (groups ?? []).flatMap((g) =>
    (g.summaries ?? []).flatMap((s) =>
      Object.values(s).map((x) => ({
        organization: x.organization.name,
        city: x.organization.address?.city ?? null,
        country: x.organization.address?.country ?? null,
        department: x["department-name"],
        role: x["role-title"],
        startYear: year(x["start-date"]),
        endYear: year(x["end-date"]),
      })),
    ),
  );
}

export function orcidProfileFromRecord(id: string, r: OrcidRecord): OrcidProfile {
  const n = r.person?.name;
  const given = n?.["given-names"]?.value?.trim() ?? "";
  const family = n?.["family-name"]?.value?.trim() ?? "";
  const a = r["activities-summary"];
  return {
    orcidId: id,
    name: n?.["credit-name"]?.value?.trim() || [given, family].filter(Boolean).join(" ") || null,
    biography: r.person?.biography?.content?.trim() || null,
    countries: (r.person?.addresses?.address ?? []).map((a) => a.country?.value).filter((c): c is string => Boolean(c)),
    urls: (r.person?.["researcher-urls"]?.["researcher-url"] ?? []).map((u) => u.url?.value).filter((u): u is string => Boolean(u)),
    educations: [...affiliations(a?.educations?.["affiliation-group"]), ...affiliations(a?.qualifications?.["affiliation-group"])],
    employments: affiliations(a?.employments?.["affiliation-group"]),
    htmlUrl: `https://orcid.org/${id}`,
  };
}

export class OrcidSearchProvider implements SearchProvider {
  readonly id = "orcid" as const;
  readonly name = "ORCID";

  private async get<T>(path: string, signal?: AbortSignal): Promise<T> {
    let res: Response;
    try {
      res = await fetch(`https://pub.orcid.org/v3.0${path}`, {
        headers: { Accept: "application/json", "User-Agent": "network-growth-assistant (personal research tool)" },
        signal: signal ?? AbortSignal.timeout(10_000),
        cache: "no-store",
      });
    } catch {
      throw new ProviderError(this.name, "Couldn't reach ORCID.", true);
    }
    if (res.status === 429 || res.status === 503) throw new ProviderError(this.name, "ORCID is busy right now.", true);
    if (!res.ok) throw new ProviderError(this.name, `ORCID returned ${res.status}.`, res.status >= 500);
    return readCappedJson<T>(res, BODY_LIMITS.api).catch(() => {
      throw new ProviderError(this.name, "ORCID sent an answer that couldn't be read.", true);
    });
  }

  async search(query: string, { count = 20, signal }: { count?: number; signal?: AbortSignal } = {}): Promise<SearchResult[]> {
    const found = await this.get<ExpandedSearch>(`/expanded-search/?q=${encodeURIComponent(query)}&rows=${Math.min(count, 20)}`, signal);
    const ids = (found["expanded-result"] ?? []).map((r) => r["orcid-id"]).filter((id) => /^\d{4}-\d{4}-\d{4}-\d{3}[\dX]$/.test(id));
    // A few records at a time, to stay polite to a free public API.
    const records: (OrcidProfile | null)[] = [];
    for (let i = 0; i < ids.length; i += 5) {
      records.push(
        ...(await Promise.all(ids.slice(i, i + 5).map((id) => this.get<OrcidRecord>(`/${id}/record`, signal).then((r) => orcidProfileFromRecord(id, r)).catch(() => null)))),
      );
    }
    return records
      .filter((p): p is OrcidProfile => p !== null)
      .map((p, i) => ({
        provider: "orcid",
        url: p.htmlUrl,
        title: p.name ? `${p.name} · ORCID` : `ORCID ${p.orcidId}`,
        snippet: [p.educations[0]?.organization, p.employments[0]?.organization].filter(Boolean).join(" · "),
        rank: i + 1,
        orcid: p,
      }));
  }
}
