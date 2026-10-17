import { test, expect } from "@playwright/test";
import { signIn, uniqueEmail } from "./helpers";

// The top bar (and on desktop the sidebar) stay in view while a long page scrolls.
test("top bar and sidebar stay visible after scrolling", async ({ page, isMobile }) => {
  await signIn(page, uniqueEmail("sticky"), "/settings");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

  // Make the page tall whatever has streamed in yet, so the test is about scrolling only.
  await page.evaluate(() => {
    const spacer = document.createElement("div");
    spacer.style.height = "3000px";
    document.querySelector("main")!.appendChild(spacer);
  });

  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(100);

  const header = page.locator("header").first();
  await expect(header).toBeInViewport({ ratio: 1 });
  expect((await header.boundingBox())!.y).toBeLessThanOrEqual(1);

  if (isMobile) {
    await expect(page.getByRole("button", { name: "Open menu" })).toBeInViewport({ ratio: 1 });
  } else {
    const sidebar = page.locator("aside").first();
    await expect(sidebar.getByRole("link", { name: "Overview" })).toBeInViewport({ ratio: 1 });
    expect((await sidebar.boundingBox())!.y).toBeLessThanOrEqual(1);
  }
});
