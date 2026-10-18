"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { newPasswordSchema, resetRequestSchema, signInSchema, signUpSchema } from "@/lib/auth/credentials";
import { safeNextPath } from "@/lib/auth/safe-next-path";
import type { MessageKey } from "@/lib/i18n";
import { getT } from "@/lib/i18n/server";
import { createClient } from "@/lib/supabase/server";

export type SignInState = { status: "idle" | "sent" | "error"; message?: string };
export type PasswordState = { status: "idle" | "confirm" | "reset-sent" | "error"; message?: string };

const magicLinkSchema = z.object({ email: z.email("errors.invalidEmail") });

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
  const t = await getT();
  const parsed = magicLinkSchema.safeParse({ email: formData.get("email") });
  if (!parsed.success) {
    return { status: "error", message: t(parsed.error.issues[0]?.message as MessageKey) };
  }

  const requestHeaders = await headers();
  const origin = requestHeaders.get("origin");
  if (!origin) return { status: "error", message: t("errors.noSiteAddress") };

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
    return { status: "error", message: t("errors.linkNotSent") };
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

async function callbackUrl(next: string): Promise<string | null> {
  const origin = (await headers()).get("origin");
  if (!origin) return null;
  const callback = new URL("/auth/callback", origin);
  callback.searchParams.set("next", next);
  return callback.toString();
}

async function nextFromRequest(): Promise<string> {
  const requestHeaders = await headers();
  const origin = requestHeaders.get("origin");
  return safeNextPath(origin ? nextFromReferer(requestHeaders.get("referer"), origin) : null);
}

export async function signInWithPassword(_prev: PasswordState, formData: FormData): Promise<PasswordState> {
  const t = await getT();
  const parsed = signInSchema.safeParse({ email: formData.get("email"), password: formData.get("password") });
  if (!parsed.success) return { status: "error", message: t(parsed.error.issues[0]?.message as MessageKey) };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  // One message for every failure, so the form can't be used to find out who has an account.
  if (error) return { status: "error", message: t("errors.wrongCredentials") };
  redirect(await nextFromRequest());
}

export async function signUpWithPassword(_prev: PasswordState, formData: FormData): Promise<PasswordState> {
  const t = await getT();
  const parsed = signUpSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    confirm: formData.get("confirm"),
  });
  if (!parsed.success) return { status: "error", message: t(parsed.error.issues[0]?.message as MessageKey) };

  const redirectTo = await callbackUrl(await nextFromRequest());
  if (!redirectTo) return { status: "error", message: t("errors.noSiteAddress") };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: { emailRedirectTo: redirectTo },
  });
  if (error) return { status: "error", message: t("errors.accountNotCreated") };
  // With email confirmation on there is no session yet; an already-registered address looks the same.
  if (!data.session) return { status: "confirm" };
  redirect(await nextFromRequest());
}

export async function requestPasswordReset(_prev: PasswordState, formData: FormData): Promise<PasswordState> {
  const t = await getT();
  const parsed = resetRequestSchema.safeParse({ email: formData.get("email") });
  if (!parsed.success) return { status: "error", message: t(parsed.error.issues[0]?.message as MessageKey) };

  const redirectTo = await callbackUrl("/auth/reset");
  if (!redirectTo) return { status: "error", message: t("errors.noSiteAddress") };

  const supabase = await createClient();
  await supabase.auth.resetPasswordForEmail(parsed.data.email, { redirectTo });
  // Same answer whether or not the address has an account.
  return { status: "reset-sent" };
}

export async function updatePassword(_prev: PasswordState, formData: FormData): Promise<PasswordState> {
  const t = await getT();
  const parsed = newPasswordSchema.safeParse({ password: formData.get("password"), confirm: formData.get("confirm") });
  if (!parsed.success) return { status: "error", message: t(parsed.error.issues[0]?.message as MessageKey) };

  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/login?error=link");
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) return { status: "error", message: t("errors.passwordNotChanged") };
  redirect("/overview");
}
