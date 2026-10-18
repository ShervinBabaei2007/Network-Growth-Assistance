import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";

/** The operator's storage and AI-use report is for the secret holder only, and holds counts and sizes, nothing personal. */

const secret = () => {
  const line = readFileSync(".env.local", "utf8").split(/\r?\n/).find((l) => l.startsWith("CRON_SECRET="));
  return process.env.CRON_SECRET ?? line?.slice(12).trim().replace(/^"|"$/g, "");
};

test("the usage report needs the secret and shows sizes against the plan", async () => {
  expect((await fetch("http://localhost:3000/api/ops/usage")).status).toBe(401);
  const res = await fetch("http://localhost:3000/api/ops/usage", { headers: { Authorization: `Bearer ${secret()}` } });
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body.status.limitMb).toBeGreaterThan(0);
  expect(["ok", "warning", "critical"]).toContain(body.status.level);
  expect(body.tables.length).toBeGreaterThan(0);
  expect(typeof body.requirement_vectors).toBe("number");
  expect(typeof body.ai_calls_today).toBe("number");
  // Table names and numbers only.
  expect(JSON.stringify(body)).not.toMatch(/@|password|token/i);
});
