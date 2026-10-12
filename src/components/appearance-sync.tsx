"use client";

import { useLayoutEffect } from "react";
import { APPEARANCE_COOKIE, APPEARANCE_MAX_AGE, applyAppearance, serializeAppearance, type Appearance } from "@/lib/appearance";

/** Writes the appearance cookie the pre-paint script reads. */
export function writeAppearanceCookie(a: Appearance) {
  const secure = location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${APPEARANCE_COOKIE}=${encodeURIComponent(serializeAppearance(a))}; Path=/; Max-Age=${APPEARANCE_MAX_AGE}; SameSite=Lax${secure}`;
}

/**
 * Keeps the page in step with the saved appearance: re-applies it (React's development
 * remount clears attributes the inline script set), refreshes the cookie when settings
 * changed elsewhere, and follows the system theme live while "System" is chosen.
 */
export function AppearanceSync({ value }: { value: Appearance }) {
  useLayoutEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    applyAppearance(value, media.matches);
    writeAppearanceCookie(value);
    if (value.theme !== "system") return;
    const follow = (e: MediaQueryListEvent) => applyAppearance(value, e.matches);
    media.addEventListener("change", follow);
    return () => media.removeEventListener("change", follow);
  }, [value]);
  return null;
}
