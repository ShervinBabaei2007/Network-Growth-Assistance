import { createHash } from "node:crypto";
import { redact } from "@/lib/server/log";

/**
 * Cleans an error report before it is stored. A report can quote what was on the screen or in the URL, so
 * everything is reduced to what a developer needs: the kind of failure and where in the code it happened.
 * Server only.
 */

const MAX_MESSAGE = 300;
const MAX_STACK = 1500;

function scrubText(text: string): string {
  return (
    redact(text)
      // A profile link names a person: keep only the fact that one was mentioned.
      .replace(/(?:https?:\/\/)?(?:[\w-]+\.)?linkedin\.com\/in\/[^\s/?#)'"]+/gi, "linkedin.com/in/[profile]")
      // Web addresses keep their path (where the code lives) but lose the host, query and fragment.
      .replace(/https?:\/\/[^\s)'"]+/g, (url) => {
        try {
          return new URL(url).pathname;
        } catch {
          return "[url]";
        }
      })
      // Ids that could point at a person's record.
      .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, "[id]")
      // Long digit runs (phone numbers, ids) and anything that looks like a profile link slug.
      .replace(/\b\d{6,}\b/g, "[number]")
  );
}

export type ScrubbedError = { message: string; stack: string | null; fingerprint: string };

export function scrubError(input: { message?: unknown; stack?: unknown; source: string; route: string }): ScrubbedError {
  const message = scrubText(String(input.message ?? "Unknown error")).slice(0, MAX_MESSAGE) || "Unknown error";
  const stack = typeof input.stack === "string" && input.stack ? scrubText(input.stack).slice(0, MAX_STACK) : null;
  // The same failure in the same place groups together: the first line of the message and the first frame.
  const firstFrame = stack?.split("\n").find((l) => /\bat\b|@/.test(l))?.trim() ?? "";
  const fingerprint = createHash("sha1").update(`${input.source}|${input.route}|${message.split("\n")[0]}|${firstFrame}`).digest("hex").slice(0, 40);
  return { message, stack, fingerprint };
}
