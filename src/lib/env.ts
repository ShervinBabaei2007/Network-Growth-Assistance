import { z } from "zod";

// NEXT_PUBLIC_* values must be referenced literally so Next.js can inline them.
const publicSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(1),
});

export function publicEnv() {
  return publicSchema.parse({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  });
}

const serverSchema = z.object({
  SUPABASE_SECRET_KEY: z.string().min(1),
  CRON_SECRET: z.string().min(16),
  ANTHROPIC_API_KEY: z.string().min(1).optional(),
});

/** Server-only secrets. Never import this from a client component. */
export function serverEnv() {
  return serverSchema.parse({
    SUPABASE_SECRET_KEY: process.env.SUPABASE_SECRET_KEY,
    CRON_SECRET: process.env.CRON_SECRET,
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY || undefined,
  });
}
