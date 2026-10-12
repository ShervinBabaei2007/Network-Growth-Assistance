import { NextResponse, type NextRequest } from "next/server";
import { emailConfig } from "@/lib/email/mailer";
import { readUnsubscribeToken } from "@/lib/email/unsubscribe";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Unsubscribe links from alert emails. No sign-in: the signed token names exactly what to
 * turn off. POST is the one-click unsubscribe mail apps send (RFC 8058); GET, from a click
 * in the email, shows a confirm button first, so link scanners can't unsubscribe anyone.
 */

function page(title: string, body: string, status = 200) {
  const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
  return new NextResponse(
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title></head><body style="font-family:system-ui,sans-serif;max-width:32rem;margin:3rem auto;padding:0 1rem;line-height:1.5"><h1 style="font-size:1.25rem">${esc(title)}</h1>${body}</body></html>`,
    { status, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } },
  );
}

function scopeFrom(request: NextRequest) {
  const config = emailConfig();
  const token = request.nextUrl.searchParams.get("token") ?? "";
  return config ? readUnsubscribeToken(token, config.secret) : null;
}

export async function GET(request: NextRequest) {
  const scope = scopeFrom(request);
  if (!scope) return page("This link doesn't work", "<p>It may have expired. You can turn emails off in Settings → Notifications.</p>", 400);
  const what = scope.searchId ? "emails for this saved search" : "all emails from the app";
  const token = request.nextUrl.searchParams.get("token")!;
  return page("Stop emails?", `<p>This will stop ${what}. In-app notifications aren't affected.</p><form method="post" action="?token=${encodeURIComponent(token)}"><button type="submit" style="padding:.5rem 1rem">Stop ${what}</button></form>`);
}

export async function POST(request: NextRequest) {
  const scope = scopeFrom(request);
  if (!scope) return page("This link doesn't work", "<p>It may have expired. You can turn emails off in Settings → Notifications.</p>", 400);
  const admin = createAdminClient();
  // Only what the signed token names, for the user it names.
  const { error } = scope.searchId
    ? await admin.from("saved_searches").update({ email_digest: false }).eq("id", scope.searchId).eq("user_id", scope.userId)
    : await admin.from("settings").update({ email_notifications: false }).eq("user_id", scope.userId);
  if (error) return page("Something went wrong", "<p>Nothing was changed. Try again, or turn emails off in Settings → Notifications.</p>", 500);
  // Emails already queued are skipped too: the sender re-checks these settings before each one.
  return page("Done", `<p>${scope.searchId ? "Emails for that saved search are off." : "All emails are off."} You can turn them back on in Settings → Notifications.</p>`);
}
