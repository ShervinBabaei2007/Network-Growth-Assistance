/** One public search hit. `structured` carries API fields (GitHub) that are evidence on their own. */
export type SearchResult = {
  provider: string;
  url: string;
  title: string;
  snippet: string;
  rank: number;
  structured?: GitHubProfile;
  orcid?: OrcidProfile;
};

/** One education or employment entry from an ORCID record, as the person entered it. */
export type OrcidAffiliation = {
  organization: string;
  city: string | null;
  /** ISO country code of the organization, e.g. "CA". */
  country: string | null;
  department: string | null;
  role: string | null;
  startYear: number | null;
  endYear: number | null;
};

export type OrcidProfile = {
  orcidId: string;
  name: string | null;
  biography: string | null;
  urls: string[];
  /** Countries the person lists on their record (ISO codes). */
  countries: string[];
  educations: OrcidAffiliation[];
  employments: OrcidAffiliation[];
  htmlUrl: string;
  /** When the person last edited their record (ISO date). Old records may list jobs they have since left. */
  lastModified?: string | null;
};

export type GitHubProfile = {
  login: string;
  name: string | null;
  bio: string | null;
  company: string | null;
  location: string | null;
  blog: string | null;
  htmlUrl: string;
};

export class ProviderError extends Error {
  constructor(
    readonly provider: string,
    message: string,
    readonly retryable = false,
  ) {
    super(message);
  }
}

/**
 * A permitted public search source. Implementations must only call their own
 * official API and must never return requests to blocked hosts as fetch targets.
 */
export interface SearchProvider {
  readonly id: "web" | "github" | "orcid";
  readonly name: string;
  search(query: string, opts?: { count?: number; signal?: AbortSignal }): Promise<SearchResult[]>;
}
