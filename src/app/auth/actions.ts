"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { safeNextPath } from "@/lib/auth/safe-next-path";
import { createClient } from "@/lib/supabase/server";

export type SignInState = { status: "idle" | "sent" | "error"; message?: string };

const signInSchema = z.object({ email: z.email("Enter a valid email address.") });

/** The `next` parameter of the login page the form was submitted from. */
function nextFromReferer(referer: string | null, origin: string): string | null {
  if (!referer) return null;
  try {
    const url = new URL(referer);
    return url.origin === origin ? url.searchParams.get("next") : null;
  } catch {
    return null;
  }
}

export async function sendMagicLink(_prev: SignInState, formData: FormData): Promise<SignInState> {
  const parsed = signInSchema.safeParse({ email: formData.get("email") });
  if (!parsed.success) {
    return { status: "error", message: parsed.error.issues[0]?.message };
  }

  const requestHeaders = await headers();
  const origin = requestHeaders.get("origin");
  if (!origin) return { status: "error", message: "Could not determine the site address." };

  const callback = new URL("/auth/callback", origin);
  callback.searchParams.set(
    "next",
    safeNextPath(nextFromReferer(requestHeaders.get("referer"), origin)),
  );

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email: parsed.data.email,
    options: { emailRedirectTo: callback.toString() },
  });

  if (error) {
    return { status: "error", message: "We couldn't send the sign-in link. Try again shortly." };
  }
  return { status: "sent" };
}

/** Starts Google sign-in; Supabase sends the person to Google and back to /auth/callback. */
export async function signInWithGoogle(): Promise<void> {
  const requestHeaders = await headers();
  const origin = requestHeaders.get("origin");
  if (!origin) redirect("/login?error=link");

  const callback = new URL("/auth/callback", origin);
  callback.searchParams.set(
    "next",
    safeNextPath(nextFromReferer(requestHeaders.get("referer"), origin)),
  );

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: callback.toString() },
  });
  if (error || !data.url) redirect("/login?error=google");
  redirect(data.url);
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
