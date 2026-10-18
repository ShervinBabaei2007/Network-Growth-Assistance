import { expect, test } from "@playwright/test";
import { expectSelected, setUpPlan, signIn, uniqueEmail } from "./helpers";

const PAGE = `<ul>
  <li><a href="https://www.linkedin.com/in/e2e-cap-a/"><span aria-hidden="true">Cap A</span><span>View Cap A’s profile</span></a>
    <div>Computer Science student at <strong>SFU</strong></div></li>
  <li><a href="https://www.linkedin.com/in/e2e-cap-b/"><span aria-hidden="true">Cap B</span></a>
    <div>Electrical Engineering | UBC</div></li>
</ul>`;

test.use({ permissions: ["clipboard-read", "clipboard-write"] });

test("quick capture: paste a search results page and add everyone", async ({ page }) => {
  await signIn(page, uniqueEmail("capture"), "/candidates");
  await setUpPlan(page, {
    schools: [{ name: "SFU" }, { name: "UBC" }],
    disciplines: [{ name: "Computer Science" }, { name: "Electrical Engineering" }],
  });
  await page.goto("/candidates");
  await page.evaluate(async (html) => {
    await navigator.clipboard.write([new ClipboardItem({ "text/html": new Blob([html], { type: "text/html" }) })]);
  }, PAGE);
  await page.getByLabel("Paste a LinkedIn search results page here").click();
  await page.keyboard.press("Control+V");
  // Matched to the user's own entries.
  await expectSelected(page.getByLabel("School for Cap A"), "SFU");
  await expectSelected(page.getByLabel("Program for Cap B"), "Electrical Engineering");
  await page.getByRole("button", { name: "Add 2 people" }).click();
  await expect(page.getByText("Added 2 (2 approved). Paste the next page.")).toBeVisible();
  await expect(page.getByLabel("Paste a LinkedIn search results page here")).toBeFocused();
});
