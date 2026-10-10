import { describe, expect, it } from "vitest";
import { normalizeProfileUrl } from "./normalize-url";

const key = (input: string) => {
  const r = normalizeProfileUrl(input);
  return r.ok ? r.key : `ERR: ${r.reason}`;
};

describe("normalizeProfileUrl", () => {
  it.each([
    "https://www.linkedin.com/in/jane-doe-123abc/",
    "https://www.linkedin.com/in/Jane-Doe-123ABC",
    "http://linkedin.com/in/jane-doe-123abc?trk=public_profile&originalSubdomain=ca",
    "https://ca.linkedin.com/in/jane-doe-123abc/en",
    "linkedin.com/in/jane-doe-123abc#experience",
    "www.linkedin.com/in/jane-doe-123abc/details/education/",
    "https://www.linkedin.com/mwlite/in/jane-doe-123abc",
    "  https://www.linkedin.com/in/jane-doe-123abc/  ",
  ])("maps %s to one key", (input) => {
    expect(key(input)).toBe("jane-doe-123abc");
  });

  it("decodes and lowercases non-ASCII slugs", () => {
    expect(key("https://www.linkedin.com/in/Ren%C3%A9-Tremblay")).toBe("rené-tremblay");
    expect(key("https://www.linkedin.com/in/rené-tremblay")).toBe("rené-tremblay");
  });

  it("produces a canonical URL", () => {
    const r = normalizeProfileUrl("ca.linkedin.com/in/René-Tremblay/?x=1");
    expect(r).toEqual({
      ok: true,
      key: "rené-tremblay",
      url: "https://www.linkedin.com/in/ren%C3%A9-tremblay",
    });
  });

  it.each([
    ["", "Enter a LinkedIn profile URL."],
    ["https://example.com/in/jane", "Only linkedin.com"],
    ["https://notlinkedin.com/in/jane", "Only linkedin.com"],
    ["https://www.linkedin.com/company/acme", "member profile link"],
    ["https://www.linkedin.com/sales/lead/ACwAA,NAME", "member profile link"],
    ["https://www.linkedin.com/search/results/people/?keywords=ubc", "member profile link"],
    ["https://www.linkedin.com/in/", "member profile link"],
    ["https://www.linkedin.com/pub/jane-doe/1/23/456", "/pub/"],
    ["https://www.linkedin.com/in/%E0%A4%A", "malformed"],
  ])("rejects %s", (input, reason) => {
    const r = normalizeProfileUrl(input);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain(reason);
  });
});
