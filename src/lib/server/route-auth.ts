import "server-only";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * The signed-in user for a Route Handler. API routes are not covered by the
 * proxy's sign-in redirect, so each handler checks here; RLS then limits every
 * query to the user's own rows.
 */
export async function routeUser() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims.sub;
  return userId ? { supabase, userId } : null;
}

export const unauthorized = () => NextResponse.json({ error: "Sign in first." }, { status: 401 });
export const notFound = () => NextResponse.json({ error: "Not found." }, { status: 404 });
export const isUuid = (s: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
