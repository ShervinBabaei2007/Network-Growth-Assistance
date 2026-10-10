export const DEFAULT_AFTER_LOGIN = "/overview";

/**
 * Restricts a post-login redirect to a path on this site, so a crafted
 * `?next=` link cannot send someone to another domain.
 */
export function safeNextPath(next: string | null | undefined): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.includes("\\")) {
    return DEFAULT_AFTER_LOGIN;
  }
  try {
    const url = new URL(next, "http://placeholder.invalid");
    if (url.origin !== "http://placeholder.invalid") return DEFAULT_AFTER_LOGIN;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return DEFAULT_AFTER_LOGIN;
  }
}
