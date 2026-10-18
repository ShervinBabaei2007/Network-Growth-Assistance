import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { adminRest, signIn, uniqueEmail, userIdFor } from "./helpers";

test.describe("browser set to Canadian French", () => {
  test.use({ locale: "fr-CA" });

  test("the sign-in page follows the browser's language, and the choice is remembered", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("tab", { name: "Se connecter" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Continuer avec Google" })).toBeVisible();
    await expect(page.getByLabel("Courriel")).toBeVisible();
    await expect.poll(() => page.evaluate(() => document.documentElement.lang)).toBe("fr-CA");

    // Errors from the server are French too.
    await page.getByRole("tab", { name: "S'inscrire" }).click();
    await page.getByLabel("Courriel").fill(uniqueEmail("fr"));
    await page.getByLabel("Mot de passe", { exact: true }).fill("correct horse 1");
    await page.getByLabel("Confirmer le mot de passe").fill("different horse 2");
    await page.getByRole("button", { name: "Créer un compte" }).click();
    await expect(page.getByText("Les mots de passe ne correspondent pas.")).toBeVisible();

    // Choosing English sticks across a reload.
    await page.getByLabel("Langue").selectOption("en");
    await expect(page.getByRole("tab", { name: "Sign in" })).toBeVisible();
    await page.reload();
    await expect(page.getByRole("tab", { name: "Sign in" })).toBeVisible();
  });
});

test("choosing French translates the app, is saved to the account and shows the welcome in French", async ({ page }) => {
  const email = uniqueEmail("fr-app");
  await signIn(page, email, "/overview", { welcome: true });

  // The welcome appears first, in English; switch language from the header (behind it) via Settings after.
  const wizard = page.getByTestId("onboarding-wizard");
  await expect(wizard).toBeVisible();
  await wizard.getByRole("button", { name: "Skip", exact: true }).click();
  await expect(wizard).toBeHidden();

  await page.getByLabel("Language").first().selectOption("fr-CA");
  await expect(page.getByRole("button", { name: "Se déconnecter" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Aperçu" }).first()).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.documentElement.lang)).toBe("fr-CA");

  // Saved to the account, so it follows the person to another device.
  const id = await userIdFor(email);
  await expect
    .poll(async () => ((await adminRest("GET", `settings?user_id=eq.${id}&select=locale`)) as { locale: string | null }[])[0]?.locale)
    .toBe("fr-CA");

  // The search button and palette are French.
  await page.goto("/overview");
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: /^Rechercher/ }).click();
  await expect(page.getByPlaceholder("Aller à une page ou rechercher…")).toBeVisible();
  await expect(page.getByRole("option", { name: /Candidatures/ }).first()).toBeVisible();
  await page.keyboard.press("Escape");
});

test("a language saved in the account applies on a device that has no cookie", async ({ page, context }) => {
  const email = uniqueEmail("fr-device");
  await signIn(page, email);
  const id = await userIdFor(email);
  await adminRest("PATCH", `settings?user_id=eq.${id}`, { locale: "fr-CA" });
  await context.clearCookies({ name: "locale" });
  await page.goto("/overview");
  await expect(page.getByRole("button", { name: "Se déconnecter" })).toBeVisible();
});

test("the welcome appears in French, including its buttons and its example-data option", async ({ page, context }) => {
  await signIn(page, uniqueEmail("fr-welcome"), "/overview", { welcome: true });
  await context.addCookies([{ name: "locale", value: "fr-CA", url: "http://localhost:3000" }]);
  await page.reload();
  const wizard = page.getByTestId("onboarding-wizard");
  await expect(wizard).toBeVisible();
  await expect(page.getByTestId("onboarding-progress")).toHaveText("Étape 1 sur 4");
  await expect(wizard.getByRole("heading", { name: "Bienvenue dans Network Growth" })).toBeVisible();
  await wizard.getByRole("button", { name: "Suivant", exact: true }).click();
  await expect(wizard.getByRole("button", { name: "Explorer avec des données d'exemple" })).toBeVisible();
  await expect(wizard.getByLabel("Trouver un emploi")).toBeVisible();
});

test("the French sign-in and app shell have no serious accessibility violations", async ({ page, context }) => {
  await context.addCookies([{ name: "locale", value: "fr-CA", url: "http://localhost:3000" }]);
  await page.goto("/login");
  await expect(page.getByRole("tab", { name: "Se connecter" })).toBeVisible();
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
  expect(results.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => v.id)).toEqual([]);
});
