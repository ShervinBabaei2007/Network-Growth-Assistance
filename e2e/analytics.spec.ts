import { expect, test } from "@playwright/test";
import { adminRest, signIn, uniqueEmail, userIdFor } from "./helpers";

test("analytics charts load when they are about to be seen, in a box that doesn't move", async ({ page }) => {
  const email = uniqueEmail("charts");
  await signIn(page, email);
  // Two recorded counts are enough for the trend chart to appear.
  const user_id = await userIdFor(email);
  const day = (offset: number) => new Date(Date.now() - offset * 86_400_000).toISOString();
  await adminRest("POST", "connection_snapshots", [
    { user_id, total_connections: 500, recorded_at: day(10) },
    { user_id, total_connections: 540, recorded_at: day(2) },
  ]);

  await page.goto("/analytics");
  const trend = page.getByRole("img", { name: "Recorded network total by date" });
  // The placeholder is swapped for the chart as it nears the screen, so retry if it detaches mid-scroll.
  await expect(() => trend.scrollIntoViewIfNeeded()).toPass();
  await expect(trend).toBeVisible();
  // The charts library arrives on demand and draws into the same box.
  await expect(trend.locator(".recharts-wrapper")).toBeVisible({ timeout: 20_000 });
  const box = await trend.boundingBox();
  expect(box!.height).toBeGreaterThan(200);
  expect(box!.height).toBeLessThan(250);
});
