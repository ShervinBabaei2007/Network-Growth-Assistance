import { expect, test } from "@playwright/test";
import { adminRest, signIn, uniqueEmail } from "./helpers";

/** An employer's own icon shows on its job cards only when its website is confirmed and the icon was fetched. Uses the fictional job fixtures. */

// A valid 1x1 PNG, as a Postgres bytea hex literal.
const PNG_HEX = "\\x89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8ffff3f0005fe02fea7d6bd5d0000000049454e44ae426082";

test("a job card shows the employer's icon only when it has one", async ({ page }) => {
  test.setTimeout(180_000);
  await signIn(page, uniqueEmail("icons"), "/jobs");
  await expect(page.getByRole("heading", { name: /jobs? from (the last|any date)/i })).toBeVisible();
  test.skip(!(await page.getByText("Showing fictional sample employers").isVisible()), "Dev server isn't running with JOBS_FIXTURES=1");

  await page.goto("/jobs/employers");
  await page.getByRole("button", { name: "Read due boards now" }).click();
  await expect(page.getByText(/Read \d+ boards?: \d+ new jobs?\.|Every board is up to date\./).first()).toBeVisible({ timeout: 45_000 });

  const [employer] = (await adminRest("GET", "employers?name=eq.Northwind%20Labs&select=id")) as { id: string }[];
  expect(employer).toBeTruthy();
  try {
    await adminRest("POST", "employer_icons", { employer_id: employer.id, content_type: "image/png", bytes: PNG_HEX });
    await adminRest("PATCH", `employers?id=eq.${employer.id}`, { website: "https://www.northwind.example", has_icon: true });

    await page.goto("/jobs?q=Developer&range=any");
    const results = page.getByRole("region", { name: /jobs from/i });
    const withIcon = results.getByRole("listitem").filter({ hasText: "Northwind Labs" }).first();
    const icon = withIcon.locator(`img[src="/api/employer-icon/${employer.id}"]`);
    await expect(icon).toHaveCount(1);
    await expect.poll(() => icon.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);

    // Every other employer keeps its initials.
    const others = results.getByRole("listitem").filter({ hasNotText: "Northwind Labs" });
    await expect(others.first()).toBeVisible();
    await expect(others.locator("img[src^='/api/employer-icon/']")).toHaveCount(0);

    // Signed out, the route gives nothing away.
    const anonymous = await page.context().browser()!.newContext();
    const res = await anonymous.request.get(new URL(`/api/employer-icon/${employer.id}`, page.url()).toString());
    expect(res.status()).toBe(401);
    await anonymous.close();
  } finally {
    await adminRest("PATCH", `employers?id=eq.${employer.id}`, { website: null, has_icon: false });
    await adminRest("DELETE", `employer_icons?employer_id=eq.${employer.id}`);
  }
});
