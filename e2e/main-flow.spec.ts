import { expect, test } from "@playwright/test";
import { setUpPlan, signIn, uniqueEmail } from "./helpers";

test("signed-out visitors are sent to sign in", async ({ page }) => {
  await page.goto("/queue");
  await expect(page).toHaveURL(/\/login\?next=%2Fqueue/);
  await expect(page.getByText("This app never asks for your LinkedIn password.")).toBeVisible();
});

test("main flow: sign in → add → approve → queue → sent → accepted → dashboard", async ({ page }) => {
  await signIn(page, uniqueEmail("main"));
  const main = page.locator("main");

  // A new user starts with nothing assumed and is asked to set up their own plan.
  await expect(main).toContainText("Set up your networking plan", { useInnerText: true });
  await setUpPlan(page, {
    goal: 2000,
    schools: [{ name: "UBC", aliases: "University of British Columbia" }],
    disciplines: [{ name: "Computer Engineering", aliases: "comp eng" }],
    targets: { "Computer Engineering": { total: 250, schools: { UBC: 125 } } },
  });

  // Starting point
  await page.goto("/overview");
  await page.getByLabel("Connections when you started").fill("1000");
  await page.getByRole("button", { name: "Save starting count" }).click();
  await expect(main).toContainText("1,000 / 2,000", { useInnerText: true });

  // Daily plan
  await page.goto("/settings");
  await page.getByLabel("Invitations you plan to send per day").fill("10");
  await page.getByRole("button", { name: "Save planning" }).click();
  await expect(page.getByTestId("form-status").filter({ hasText: "Saved." })).toBeVisible();

  // Add a candidate and approve in one go
  await page.goto("/candidates");
  await page.getByText("Add one person by hand").click();
  await page.getByLabel("LinkedIn profile URL").fill("https://ca.linkedin.com/in/e2e-ada/?trk=x");
  await page.getByLabel("Name", { exact: true }).fill("Ada E2E");
  await page.getByLabel("School (as shown on the profile)").fill("University of British Columbia");
  await page.getByLabel("Program or major (as shown)").fill("Computer Engineering");
  await page.getByRole("checkbox", { name: /Approve for outreach now/ }).check();
  await page.getByRole("button", { name: "Add candidate" }).click();
  await expect(page.getByTestId("form-status").filter({ hasText: "Added." })).toBeVisible();

  // Queue
  await page.goto("/queue");
  await page.getByRole("button", { name: "Build today's queue" }).click();
  await expect(main).toContainText("To send (1)", { useInnerText: true });
  await expect(page.getByRole("link", { name: /Open on LinkedIn/ })).toHaveAttribute("href", "https://www.linkedin.com/in/e2e-ada");
  await page.getByRole("button", { name: "Mark sent" }).click();
  await expect(main).toContainText("1 of 10 planned invitations sent", { useInnerText: true });

  // Acceptance
  await page.getByRole("link", { name: "Ada E2E" }).click();
  await expect(page.getByRole("heading", { name: "Ada E2E" })).toBeVisible();
  await page.getByRole("button", { name: "Save outcome" }).click();
  await expect(main).toContainText("Outcome accepted on", { useInnerText: true });

  // Dashboard and analytics reflect it
  await page.goto("/overview");
  await expect(main).toContainText("Tracked accepted 1", { useInnerText: true });
  await expect(main).toContainText("Computer Engineering Focus 1 / 250", { useInnerText: true });
  await page.goto("/universities");
  const ubcCe = page.locator("table").first().getByRole("row").filter({ hasText: "Computer Engineering" }).filter({ hasText: "UBC" });
  await expect(ubcCe.getByRole("cell")).toHaveText(["Computer Engineering", "UBC", "1", "125", "124", "0", "0"]);
  await page.goto("/analytics");
  await expect(main).toContainText("Invitations sent · last 30 days", { useInnerText: true });
  await expect(main).not.toContainText("No activity recorded in this period yet.", { useInnerText: true });
});

test("the same profile can't be added twice", async ({ page }) => {
  await signIn(page, uniqueEmail("dupe"), "/candidates");
  await page.getByText("Add one person by hand").click();
  const add = async (url: string) => {
    await page.getByLabel("LinkedIn profile URL").fill(url);
    await page.getByLabel("Name", { exact: true }).fill("Dupe Person");
    await page.getByRole("button", { name: "Add candidate" }).click();
  };
  await add("https://www.linkedin.com/in/e2e-dupe");
  await expect(page.getByTestId("form-status").filter({ hasText: "Added" })).toBeVisible();
  await add("linkedin.com/in/E2E-Dupe/");
  await expect(page.getByTestId("form-error").filter({ hasText: "already in your list" })).toBeVisible();
});
