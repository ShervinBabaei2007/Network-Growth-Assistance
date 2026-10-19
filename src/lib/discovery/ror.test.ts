import { describe, expect, it, vi } from "vitest";
import { findSchoolByAcronym, schoolAcronymCandidates } from "./ror";

const item = (name: string, acronym: string, site: string) => ({ names: [{ value: name, types: ["ror_display", "label"] }, { value: acronym, types: ["acronym"] }], links: [{ type: "website", value: site }] });
const reply = (items: unknown[]) => vi.fn(async () => new Response(JSON.stringify({ items }))) as unknown as typeof fetch;

describe("school short names", () => {
  it("finds the short names in a request", () => {
    expect(schoolAcronymCandidates("Find 20 SFU alumni in Vancouver working at Microsoft")).toEqual(["SFU"]);
    expect(schoolAcronymCandidates("people who graduated from UBC and now work at AWS")).toEqual(["UBC", "AWS"]);
    expect(schoolAcronymCandidates("Find 20 Computer Science alumni working as software engineers at startups")).toEqual([]);
  });

  it("resolves an acronym only when exactly one school in the country has it", async () => {
    const sfu = await findSchoolByAcronym("SFU", "CA", reply([item("Simon Fraser University", "SFU", "https://www.sfu.ca/")]));
    expect(sfu).toEqual({ name: "Simon Fraser University", aliases: ["SFU"], domain: "sfu.ca" });
    expect(await findSchoolByAcronym("XYZ", "CA", reply([item("One University", "XYZ", "https://one.ca"), item("Two College", "XYZ", "https://two.ca")]))).toBeNull();
    expect(await findSchoolByAcronym("ABC", "CA", reply([item("Another University", "DEF", "https://a.ca")]))).toBeNull();
  });

  it("learns nothing, and remembers nothing, when the registry can't be reached", async () => {
    const down = vi.fn(async () => { throw new Error("offline"); }) as unknown as typeof fetch;
    expect(await findSchoolByAcronym("QQQ", "CA", down)).toBeNull();
    const up = reply([item("Quest Quest University", "QQQ", "https://q.ca")]);
    expect((await findSchoolByAcronym("QQQ", "CA", up))?.name).toBe("Quest Quest University");
  });
});
