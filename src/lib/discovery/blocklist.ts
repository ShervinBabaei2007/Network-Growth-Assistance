/**
 * Hosts the research agent must never fetch. LinkedIn profiles and search pages are
 * off limits: a LinkedIn URL may be kept as a link the user opens themselves, but the
 * app never requests it.
 */
const BLOCKED_HOSTS = [/(^|\.)linkedin\.com$/i, /(^|\.)lnkd\.in$/i, /(^|\.)licdn\.com$/i];

export function hostOf(url: string): string | null {
  try {
    const u = new URL(url);
    return u.protocol === "http:" || u.protocol === "https:" ? u.hostname.toLowerCase() : null;
  } catch {
    return null;
  }
}

export function isLinkedInUrl(url: string): boolean {
  const host = hostOf(url);
  return host !== null && BLOCKED_HOSTS.some((re) => re.test(host));
}

/** True only for public http(s) URLs we are allowed to request. */
export function isFetchable(url: string): boolean {
  const host = hostOf(url);
  if (!host || isLinkedInUrl(url)) return false;
  // No private, loopback or link-local targets (the fetcher runs on our server).
  if (host === "localhost" || host.endsWith(".local") || host.endsWith(".internal")) return false;
  if (/^(127\.|10\.|192\.168\.|169\.254\.|0\.)/.test(host) || /^172\.(1[6-9]|2\d|3[01])\./.test(host)) return false;
  if (host.startsWith("[") || host === "::1") return false;
  return true;
}
