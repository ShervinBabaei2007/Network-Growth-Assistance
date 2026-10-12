import "server-only";
import { z } from "zod";

export { publicEnv } from "./env.public";

const serverSchema = z.object({
  SUPABASE_SECRET_KEY: z.string().min(1),
  CRON_SECRET: z.string().min(16),
  GEMINI_API_KEY: z.string().min(1).optional(),
  GEMINI_MODEL: z.string().min(1).optional(),
  ANTHROPIC_API_KEY: z.string().min(1).optional(),
  BRAVE_SEARCH_API_KEY: z.string().min(1).optional(),
  GITHUB_TOKEN: z.string().min(1).optional(),
  EMBED_SECRET: z.string().min(16).optional(),
  APP_ENCRYPTION_KEY: z.string().min(32).optional(),
  AI_DAILY_QUOTA: z.coerce.number().int().min(0).optional(),
  ADZUNA_APP_ID: z.string().min(1).optional(),
  ADZUNA_APP_KEY: z.string().min(1).optional(),
  USAJOBS_API_KEY: z.string().min(1).optional(),
  USAJOBS_EMAIL: z.email().optional(),
});

/** Server-only secrets. Never import this from a client component. */
export function serverEnv() {
  return serverSchema.parse({
    SUPABASE_SECRET_KEY: process.env.SUPABASE_SECRET_KEY,
    CRON_SECRET: process.env.CRON_SECRET,
    GEMINI_API_KEY: process.env.GEMINI_API_KEY || undefined,
    GEMINI_MODEL: process.env.GEMINI_MODEL || undefined,
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY || undefined,
    BRAVE_SEARCH_API_KEY: process.env.BRAVE_SEARCH_API_KEY || undefined,
    GITHUB_TOKEN: process.env.GITHUB_TOKEN || undefined,
    EMBED_SECRET: process.env.EMBED_SECRET || undefined,
    APP_ENCRYPTION_KEY: process.env.APP_ENCRYPTION_KEY || undefined,
    AI_DAILY_QUOTA: process.env.AI_DAILY_QUOTA || undefined,
    ADZUNA_APP_ID: process.env.ADZUNA_APP_ID || undefined,
    ADZUNA_APP_KEY: process.env.ADZUNA_APP_KEY || undefined,
    USAJOBS_API_KEY: process.env.USAJOBS_API_KEY || undefined,
    USAJOBS_EMAIL: process.env.USAJOBS_EMAIL || undefined,
  });
}
