import { expect, test } from "@playwright/test";
import { signIn, uniqueEmail } from "./helpers";

/**
 * Discovery end to end against the built-in fictional dataset. The dev server
 * must run with DISCOVERY_FIXTURES=1 (the Playwright config sets it when it
 * starts the server); otherwise this test is skipped rather than calling real APIs.
 */

const CONNECTIONS_CSV = `Notes:
"When exporting your connection data, you may notice that some of the email addresses are missing."

First Name,Last Name,URL,Email Address,Company,Position,Connected On
Sam,Patel,,sam@example.test,NVIDIA,Software Engineer,01 Jan 2025
Jamie,Rivera,https://www.linkedin.com/in/jamie-rivera-fixture,,Shopify,Developer,02 Feb 2025
`;

test("import connections, research people, review evidence and track one", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await signIn(page, uniqueEmail("discovery"), "/discover");
  const sources = page.getByText(/^Sources: /);
  await expect(sources).toBeVisible();
  test.skip(!(await sources.textContent())?.includes("Fixture web"), "Dev server isn't running with DISCOVERY_FIXTURES=1");

  // 1. Import known connections, with a preview first.
  await page.goto("/connections");
  await page.getByLabel("Connections CSV").setInputFiles({ name: "Connections.csv", mimeType: "text/csv", buffer: Buffer.from(CONNECTIONS_CSV) });
  await page.getByRole("button", { name: "Preview" }).click();
  await expect(page.getByText("2 new known connection(s) to add")).toBeVisible();
  await expect(page.getByText("sam@example.test")).toHaveCount(0);
  await page.getByRole("button", { name: "Import" }).click();
  await expect(page.getByText(/2 known connections imported/)).toBeVisible();
  await expect(page.getByRole("cell", { name: "Sam Patel" })).toBeVisible();

  // 2. Ask for people in plain language.
  await page.goto("/discover");
  await expect(page.getByText("2 known connections will be left out of results.")).toBeVisible();
  await page.getByLabel("Who would you like to meet?").fill("Find 5 UofT Computer Engineering alumni working as software engineers");
  await page.getByRole("button", { name: "Find people" }).click();
  await page.waitForURL(/\/discover\/[0-9a-f-]{36}$/);

  // 3. Real progress until the research completes.
  await expect(page.getByRole("heading", { name: "Research complete" })).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole("heading", { name: /verified match/ })).toBeVisible();

  // Verified, evidence-backed people; LinkedIn was never a source.
  const alex = page.getByRole("article", { name: "Alex Chen" });
  await expect(alex).toBeVisible();
  await expect(alex.getByText("✓ University of Toronto")).toBeVisible();
  await expect(alex.getByText("✓ Not found in your known 1st-degree connections")).toBeVisible();

  // Every person has a LinkedIn button: their own published profile when known, otherwise a people search.
  await expect(alex.getByRole("link", { name: /Open Alex Chen's LinkedIn profile/ })).toHaveAttribute("href", "https://www.linkedin.com/in/alex-chen-fixture");
  // Taylor Kim's profile link came from their GitHub "social accounts", found during verification.
  const taylor = page.getByRole("article", { name: "Taylor Kim" });
  await expect(taylor.getByRole("link", { name: /LinkedIn profile/ })).toHaveAttribute("href", "https://www.linkedin.com/in/taylor-kim-fixture");
  const wei = page.getByRole("article", { name: "Wei Zhang" });
  await expect(wei.getByRole("link", { name: /Search LinkedIn for Wei Zhang/ })).toHaveAttribute("href", /linkedin\.com\/search\/results\/people\/\?keywords=Wei%20Zhang%20Apple/);
  await expect(page.getByText("Verifying the top matches on their own pages")).toBeVisible();

  // Canada only: Sam Lee matches everything else but lives in Seattle, so is left out, with the reason shown.
  await expect(page.getByRole("article", { name: "Sam Lee" })).toHaveCount(0);
  await page.getByText(/Found but didn't qualify/).click();
  await expect(page.getByText("Located outside Canada (Seattle, WA)")).toBeVisible();

  // Sam Patel is in the imported connections (same name and company): hidden, not shown as a match.
  await expect(page.getByRole("article", { name: "Sam Patel" })).toHaveCount(0);
  await page.getByText(/Hidden: likely already in your connections/).click();
  await expect(page.getByText(/Sam Patel/)).toBeVisible();

  // ECE is not treated as Computer Engineering: Jordan Lee is only a possible match.
  await page.getByText(/Include lower-confidence matches/).click();
  await expect(page.getByRole("article", { name: "Jordan Lee" })).toBeVisible();
  // A lookalike school never qualifies.
  await expect(page.getByRole("article", { name: "Maria Gomez" })).toHaveCount(0);

  // 4. Evidence drawer: every fact quoted from a public source; invented facts were dropped.
  await alex.getByRole("button", { name: "View evidence" }).click();
  const drawer = page.getByRole("dialog");
  await expect(drawer.getByText("“I graduated from the University of Toronto with a BASc in Computer Engineering in 2023.”").first()).toBeVisible();
  await expect(drawer.getByText(/Google/)).toHaveCount(0);
  await expect(drawer.getByRole("link", { name: /LinkedIn profile in a new tab/ })).toHaveAttribute("target", "_blank");

  // 5. Manual degree, intro message (copied, never sent), CRM status.
  await drawer.getByRole("button", { name: "2nd degree" }).click();
  await expect(drawer.getByText("2nd degree (marked by you)").first()).toBeVisible();
  const intro = drawer.getByLabel("Intro message");
  await expect(intro).toHaveValue(/UofT Computer Engineering/);
  await drawer.getByRole("button", { name: "Copy message" }).click();
  await expect(drawer.getByText(/Copied\. Paste it into LinkedIn yourself/)).toBeVisible();
  await drawer.getByRole("button", { name: "I sent a connection request" }).click();
  await expect(drawer.getByLabel("Status")).toHaveValue("connection_sent_manually");
  await page.keyboard.press("Escape");

  // 6. The person is tracked in People.
  await page.goto("/people");
  await expect(page.getByRole("link", { name: "Alex Chen" })).toBeVisible();
  await expect(page.getByRole("row", { name: /Alex Chen/ }).getByText("Connection request sent")).toBeVisible();
});

test("discovery API requires sign-in and returns 404 for searches you don't own", async ({ page, request }) => {
  const anon = await request.get("/api/network/searches/00000000-0000-0000-0000-000000000000");
  expect(anon.status()).toBe(401);
  const start = await request.post("/api/network/discover", { data: { query: "Find 5 UofT CE grads" } });
  expect(start.status()).toBe(401);

  await signIn(page, uniqueEmail("discovery-authz"), "/discover");
  const res = await page.request.get("/api/network/searches/00000000-0000-0000-0000-000000000000");
  expect(res.status()).toBe(404);
  const person = await page.request.get("/api/network/people/00000000-0000-0000-0000-000000000000");
  expect(person.status()).toBe(404);
});
