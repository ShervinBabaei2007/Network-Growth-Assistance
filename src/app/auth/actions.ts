"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { safeNextPath } from "@/lib/auth/safe-next-path";
import { createClient } from "@/lib/supabase/server";

export type SignInState = { status: "idle" | "sent" | "error"; message?: string };

const signInSchema = z.object({
  email: z.email("Enter a valid email address."),
  next: z.string().optional(),
});

export async function sendMagicLink(_prev: SignInState, formData: FormData): Promise<SignInState> {
  const parsed = signInSchema.safeParse({
    email: formData.get("email"),
    next: formData.get("next") ?? undefined,
  });
  if (!parsed.success) {
    return { status: "error", message: parsed.error.issues[0]?.message };
  }

  const origin = (await headers()).get("origin");
  if (!origin) return { status: "error", message: "Could not determine the site address." };

  const callback = new URL("/auth/callback", origin);
  callback.searchParams.set("next", safeNextPath(parsed.data.next));

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

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
