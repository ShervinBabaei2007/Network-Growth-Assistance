"use client";

import { useEffect } from "react";
import { reportClientError } from "@/lib/monitoring/client";

/** The last resort: shown if the root layout itself fails. Plain HTML, because nothing else can be trusted to load. */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    reportClientError(error, error.digest);
  }, [error]);

  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", padding: "2rem", maxWidth: "32rem", margin: "0 auto" }}>
        <h1 style={{ fontSize: "1.25rem" }}>Something went wrong.</h1>
        <p>Nothing you entered was lost. Try again; if it keeps happening, reload the page.</p>
        <button type="button" onClick={reset} style={{ padding: "0.5rem 1rem" }}>
          Try again
        </button>
      </body>
    </html>
  );
}
