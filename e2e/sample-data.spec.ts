import { expect, test } from "@playwright/test";
import { adminRest, signIn, uniqueEmail, userIdFor } from "./helpers";

const counts = async (email: string) => {
  const id = await userIdFor(email);
  const rows = async (table: string) => ((await adminRest("GET", `${table}?user_id=eq.${id}&select=id`)) as unknown[]).length;
  return { candidates: await rows("candidates"), applications: await rows("applications"), universities: await rows("universities") };
};

test("look around with example data, see it labelled, exclude it from the export, then clear it", async ({ page }) => {
  const email = uniqueEmail("sample");
  await signIn(page, email, "/overview", { welcome: true });
  const wizard = page.getByTestId("onboarding-wizard");
  await expect(wizard).toBeVisible();
  await wizard.getByRole("button", { name: "Next", exact: true }).click();
  await wizard.getByRole("button", { name: "Look around with example data" }).click();

  // The app is full, labelled as examples, and the tour can run on it.
  await expect(page.getByTestId("sample-banner")).toBeVisible();
  await expect(wizard).toBeHidden();
  expect(await counts(email)).toEqual({ candidates: 30, applications: 9, universities: 3 });
  await page.goto("/applications");
  await expect(page.getByText("Example Co. F").first()).toBeVisible();

  // Example rows are not part of the user's export.
  const exported = await (await page.request.get("/api/export")).json();
  expect(exported.candidates).toHaveLength(0);
  expect(exported.applications).toHaveLength(0);

  // Clearing leaves nothing behind and brings the welcome back.
  await page.getByRole("button", { name: "Clear sample data" }).click();
  await expect(page.getByTestId("sample-banner")).toBeHidden();
  await expect.poll(() => counts(email)).toEqual({ candidates: 0, applications: 0, universities: 0 });
  await page.goto("/overview");
  await expect(wizard).toBeVisible();
});
