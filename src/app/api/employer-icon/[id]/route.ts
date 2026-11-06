import { NextResponse } from "next/server";
import { isUuid, notFound, routeUser, unauthorized } from "@/lib/server/route-auth";

/**
 * An employer's own icon, stored by the crawl from its confirmed website and served from our origin so the browser never
 * contacts a third party. Signed-in people only; 404 when the employer has none (the card then shows initials).
 */
export async function GET(_: Request, { params }: RouteContext<"/api/employer-icon/[id]">) {
  const user = await routeUser();
  if (!user) return unauthorized();
  const { id } = await params;
  if (!isUuid(id)) return notFound();
  const { data } = await user.supabase.from("employer_icons").select("content_type, bytes").eq("employer_id", id).maybeSingle();
  if (!data) return notFound();
  // PostgREST returns bytea as a "\x…" hex string.
  const bytes = Buffer.from(data.bytes.replace(/^\\x/, ""), "hex");
  return new NextResponse(bytes, {
    headers: {
      "Content-Type": data.content_type,
      "Content-Length": String(bytes.length),
      "Cache-Control": "private, max-age=86400",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
    },
  });
}
