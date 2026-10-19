import { afterEach, describe, expect, it, vi } from "vitest";
import { OrcidSearchProvider } from "./orcid";

const id = (n: number) => `0000-0000-0000-${String(n).padStart(4, "0")}`;
const record = (n: number) => ({
  person: { name: { "given-names": { value: "Person" }, "family-name": { value: `Number${n}` } } },
  history: { "last-modified-date": { value: Date.UTC(2026, 0, 1) } },
  "activities-summary": {},
});

describe("ORCID search", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("reads further pages up to the count and reports how many people match in all", async () => {
    const searchStarts: number[] = [];
    vi.stubGlobal("fetch", async (url: string) => {
      const u = new URL(url);
      if (u.pathname.includes("expanded-search")) {
        const start = Number(u.searchParams.get("start"));
        searchStarts.push(start);
        const rows = Number(u.searchParams.get("rows"));
        const ids = Array.from({ length: rows }, (_, i) => ({ "orcid-id": id(start + i + 1) }));
        return new Response(JSON.stringify({ "expanded-result": ids, "num-found": 500 }));
      }
      return new Response(JSON.stringify(record(Number(u.pathname.split("/")[2].slice(-4)))));
    });
    const r = await new OrcidSearchProvider().search("q", { count: 30 });
    expect(searchStarts).toEqual([0, 20]);
    expect(r).toHaveLength(30);
    expect(r.every((x) => x.total === 500)).toBe(true);
    expect(r[0].orcid?.lastModified).toBe("2026-01-01T00:00:00.000Z");
  });

  it("stops when the registry has fewer people than asked for", async () => {
    vi.stubGlobal("fetch", async (url: string) => {
      const u = new URL(url);
      if (u.pathname.includes("expanded-search")) return new Response(JSON.stringify({ "expanded-result": [{ "orcid-id": id(1) }, { "orcid-id": id(2) }], "num-found": 2 }));
      return new Response(JSON.stringify(record(1)));
    });
    const r = await new OrcidSearchProvider().search("q", { count: 60 });
    expect(r).toHaveLength(2);
    expect(r[0].total).toBe(2);
  });
});
