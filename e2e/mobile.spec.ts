import { expect, test } from "@playwright/test";
import { adminRest, signIn, uniqueEmail, userIdFor } from "./helpers";

test("mobile: menu works and pages fit the screen", async ({ page }) => {
  await signIn(page, uniqueEmail("mobile"));
  for (const [link, path] of [["Daily Queue", "/queue"], ["Candidates", "/candidates"], ["Discover", "/discover"], ["People", "/people"], ["Connections", "/connections"], ["Analytics", "/analytics"], ["Jobs", "/jobs"], ["Applications", "/applications"]] as const) {
    // The page may still be hydrating: keep tapping the menu button until the menu is really open.
    await expect(async () => {
      await page.getByRole("button", { name: "Open menu" }).click();
      await expect(page.getByRole("dialog", { name: "Network Growth" })).toBeVisible({ timeout: 2_000 });
    }).toPass({ timeout: 20_000 });
    // Links that aren't everyday ones for the user's goal are under "More".
    const item = page.getByRole("link", { name: link });
    if (!(await item.isVisible())) await page.getByRole("button", { name: "More" }).click();
    await item.click();
    await expect(page).toHaveURL(new RegExp(path));
    // The menu sheet closes. (Toasts also have role "dialog", so match the menu by its title.)
    await expect(page.getByRole("dialog", { name: "Network Growth" })).toBeHidden();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  }
  // The resume page (import, review, versions) fits too.
  await page.goto("/jobs/resume");
  await expect(page.getByRole("heading", { name: "Your resume" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
  // So do notifications and saved searches (here, their empty states).
  for (const [path, heading] of [["/notifications", "Notifications"], ["/jobs/searches", "Saved searches"], ["/companies/northwind-labs", "Northwind Labs"]] as const) {
    await page.goto(path);
    await expect(page.getByRole("heading", { name: heading, level: 1 })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
  }
});

// Content wider than the box that clips it (a Card hides its overflow) is cut off on screen, and the page itself
// doesn't scroll sideways, so this has to look at each element rather than at the document.
test("mobile: nothing is cut off at 360px wide", async ({ page }) => {
  test.setTimeout(240_000);
  await page.setViewportSize({ width: 360, height: 800 });
  await signIn(page, uniqueEmail("fit360"));
  const paths = ["overview", "jobs", "jobs/resume", "jobs/searches", "jobs/employers", "jobs/add", "candidates", "candidates/import", "people", "connections", "applications", "analytics", "settings", "queue", "discover", "help", "notifications", "disciplines", "universities"];
  for (const path of paths) {
    await page.goto(`/${path}`);
    await expect(page.locator("main h1").first()).toBeVisible();
    const cutOff = await page.evaluate(() => {
      const vw = window.innerWidth;
      const isCut = (el: Element) => {
        const r = el.getBoundingClientRect();
        for (let n: Element | null = el.parentElement; n && n !== document.body; n = n.parentElement) {
          const o = getComputedStyle(n).overflowX;
          if (o === "auto" || o === "scroll") return false; // a scroller is on purpose
          if (o === "hidden" || o === "clip") return r.right > n.getBoundingClientRect().right + 1;
        }
        return r.right > vw + 1;
      };
      return [...document.querySelectorAll("main *")].filter((el) => el.getBoundingClientRect().width > 0 && isCut(el)).map((el) => `${el.tagName.toLowerCase()}.${String(el.className).slice(0, 40)}`);
    });
    expect(cutOff, `/${path} has content cut off`).toEqual([]);
  }
});

test("mobile: lists are cards with labelled rows, not a squeezed table", async ({ page }) => {
  const email = uniqueEmail("cards");
  await signIn(page, email);
  const user_id = await userIdFor(email);
  await adminRest("POST", "known_connections", [
    { user_id, full_name: "Sam Rivera", normalized_name: "sam rivera", company: "Northwind Labs", position: "Platform Engineer" },
    { user_id, full_name: "Ana Costa", normalized_name: "ana costa", company: "Contoso", position: "Designer" },
  ]);
  await page.goto("/connections");
  const rows = page.getByRole("main").locator("tbody tr");
  await expect(rows).toHaveCount(2);
  // The header row is gone and the column that is hidden on small tables is shown inside the card.
  await expect(page.locator("thead")).toBeHidden();
  const source = rows.first().locator('td[data-label="Source"]');
  await expect(source).toBeVisible();
  await expect(source).toHaveText("Added by hand");
  expect(await source.evaluate((el) => getComputedStyle(el, "::before").content)).toBe('"Source"');
  // Every card has its own border, including the last one.
  for (const i of [0, 1]) expect(await rows.nth(i).evaluate((el) => getComputedStyle(el).borderTopWidth)).not.toBe("0px");
});
