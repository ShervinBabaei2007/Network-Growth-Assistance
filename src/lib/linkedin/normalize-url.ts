export type NormalizedProfile =
  | { ok: true; key: string; url: string }
  | { ok: false; reason: string };

const LINKEDIN_HOST = /(^|\.)linkedin\.com$/i;

/**
 * Turns any form of a LinkedIn member profile link into a stable key (the
 * lowercase, decoded slug) and a canonical URL. The key is what duplicate
 * detection uses, so `linkedin.com/in/Jane-Doe/?trk=x` and
 * `https://ca.linkedin.com/in/jane-doe` are the same person.
 */
export function normalizeProfileUrl(input: string): NormalizedProfile {
  const raw = input.trim();
  if (!raw) return { ok: false, reason: "Enter a LinkedIn profile URL." };

  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw.replace(/^\/+/, "")}`);
  } catch {
    return { ok: false, reason: "That doesn't look like a URL." };
  }
  if (!LINKEDIN_HOST.test(url.hostname)) {
    return { ok: false, reason: "Only linkedin.com profile links are supported." };
  }

  const parts = url.pathname.split("/").filter(Boolean);
  // /in/<slug>, also the lightweight mobile site /mwlite/in/<slug>
  const inIndex = parts.indexOf("in");
  if (inIndex === -1 || inIndex > 1 || !parts[inIndex + 1]) {
    if (parts[0] === "pub") {
      return { ok: false, reason: "Old /pub/ links aren't supported. Open the profile and copy its /in/ link." };
    }
    return { ok: false, reason: "Use a member profile link (linkedin.com/in/…), not a company, search or Sales Navigator page." };
  }

  let slug: string;
  try {
    slug = decodeURIComponent(parts[inIndex + 1]);
  } catch {
    return { ok: false, reason: "The profile link is malformed." };
  }
  const key = slug.normalize("NFC").toLowerCase().trim();
  if (!key || /[\s/?#]/.test(key) || key.length > 200) {
    return { ok: false, reason: "The profile link is malformed." };
  }

  return { ok: true, key, url: `https://www.linkedin.com/in/${encodeURIComponent(key)}` };
}
