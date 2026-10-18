/**
 * Whether "Continue with Google" can work, decided before sending anyone away. Supabase answers an unconfigured
 * provider with a raw JSON error page, which is a dead end for a visitor; checking first lets the login page show
 * a friendly message instead.
 */

/**
 * True when the Google address Supabase built has a real client id. A local setup that enabled Google but never
 * supplied GOOGLE_CLIENT_ID sends the literal text "env(GOOGLE_CLIENT_ID)", which Google rejects.
 */
export function googleUrlHasClient(url: string): boolean {
  try {
    const id = new URL(url).searchParams.get("client_id") ?? "";
    return id.length > 0 && !/^env\(|^\$\{|^%/i.test(id);
  } catch {
    return false;
  }
}
