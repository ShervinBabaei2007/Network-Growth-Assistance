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

const FRENCH_HEADINGS: [string, string][] = [
  ["/overview", "Aperçu"], ["/queue", "File du jour"], ["/analytics", "Statistiques"], ["/candidates", "Candidats"],
  ["/people", "Personnes à rencontrer"], ["/connections", "Relations connues"], ["/universities", "Établissements"],
  ["/disciplines", "Disciplines"], ["/settings", "Paramètres"], ["/applications", "Candidatures"], ["/follow-ups", "Suivis"],
  ["/help", "Aide"], ["/jobs", "Emplois"], ["/jobs/resume", "Votre CV"], ["/jobs/searches", "Recherches enregistrées"],
  ["/jobs/employers", "Employeurs"], ["/jobs/hidden", "Emplois masqués"], ["/notifications", "Notifications"], ["/discover", "Découverte du réseau"],
];

test("every signed-in page has its title in French", async ({ page, context }) => {
  test.setTimeout(180_000);
  await signIn(page, uniqueEmail("fr-titles"));
  await context.addCookies([{ name: "locale", value: "fr-CA", url: "http://localhost:3000" }]);
  for (const [path, title] of FRENCH_HEADINGS) {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1, name: title, exact: true }), path).toBeVisible();
  }
});

test("the Overview body is in French, and the starting-count form saves in French", async ({ page, context }) => {
  test.setTimeout(120_000);
  await signIn(page, uniqueEmail("fr-overview"));
  await context.addCookies([{ name: "locale", value: "fr-CA", url: "http://localhost:3000" }]);
  await page.goto("/overview");
  await expect(page.getByText("Prochaine action recommandée")).toBeVisible();
  await expect(page.getByText("Next recommended action")).toHaveCount(0);
  await expect(page.getByRole("link", { name: /Configurer mon plan/ })).toBeVisible();
});

test("the Queue and Analytics bodies are in French", async ({ page, context }) => {
  test.setTimeout(120_000);
  await signIn(page, uniqueEmail("fr-queue"));
  await context.addCookies([{ name: "locale", value: "fr-CA", url: "http://localhost:3000" }]);
  await page.goto("/queue");
  await expect(page.getByText("Définissez un objectif quotidien d'invitations pour obtenir une file")).toBeVisible();
  await page.goto("/analytics");
  await expect(page.getByRole("heading", { name: "Acceptation" })).toBeVisible();
  await expect(page.getByText("Taux d'acceptation")).toBeVisible();
  await expect(page.getByText("Weekly activity")).toHaveCount(0);
});

test("the Candidates list and its shared pieces are in French", async ({ page, context }) => {
  test.setTimeout(120_000);
  await signIn(page, uniqueEmail("fr-cands"));
  await context.addCookies([{ name: "locale", value: "fr-CA", url: "http://localhost:3000" }]);
  await page.goto("/candidates");
  await expect(page.getByRole("heading", { name: "Aucun candidat pour l'instant" })).toBeVisible();
  await expect(page.getByText("Ajouter une personne à la main")).toBeVisible();
  await expect(page.getByRole("button", { name: "Filtrer" })).toBeVisible();
  await expect(page.getByText("Vues enregistrées")).toBeVisible();
  await page.goto("/notifications");
  await expect(page.getByText("Rien pour l'instant")).toBeVisible();
  await page.goto("/follow-ups");
  await expect(page.getByRole("heading", { name: "Aucun suivi en attente" })).toBeVisible();
});

test("People and Applications lists are in French", async ({ page, context }) => {
  test.setTimeout(120_000);
  const email = uniqueEmail("fr-lists");
  await signIn(page, email);
  const id = await userIdFor(email);
  await adminRest("POST", "applications", [{ user_id: id, title: "Alpha Role", company: "Co", stage: "applied" }]);
  await context.addCookies([{ name: "locale", value: "fr-CA", url: "http://localhost:3000" }]);
  await page.goto("/people");
  await expect(page.getByRole("heading", { name: "Aucune personne enregistrée pour l'instant" })).toBeVisible();
  await page.goto("/applications");
  await expect(page.getByRole("heading", { name: "Postulée", level: 2 })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Affichage" }).getByText("1 candidature, 1 ouvertes")).toBeVisible();
  await expect(page.getByLabel("Étape de Alpha Role")).toBeVisible();
});

test("Settings, Connections and Help are in French", async ({ page, context }) => {
  test.setTimeout(120_000);
  await signIn(page, uniqueEmail("fr-settings"));
  await context.addCookies([{ name: "locale", value: "fr-CA", url: "http://localhost:3000" }]);
  await page.goto("/settings");
  await expect(page.getByText("Votre plan de réseautage").first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Enregistrer l'objectif" })).toBeVisible();
  await expect(page.getByText("Planification quotidienne")).toBeVisible();
  await page.goto("/connections");
  await expect(page.getByText("Importer un fichier de relations")).toBeVisible();
  await page.goto("/help");
  await expect(page.getByText("À quoi sert chaque page?")).toBeVisible();
});

test("the Jobs page is in French", async ({ page, context }) => {
  test.setTimeout(120_000);
  await signIn(page, uniqueEmail("fr-jobs"));
  await context.addCookies([{ name: "locale", value: "fr-CA", url: "http://localhost:3000" }]);
  await page.goto("/jobs");
  await expect(page.getByRole("search", { name: "Rechercher des emplois" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Correspondance" })).toBeVisible();
  await expect(page.getByText("Commencez par votre CV")).toBeVisible();
});

test("an application's record is in French", async ({ page, context }) => {
  test.setTimeout(120_000);
  const email = uniqueEmail("fr-record");
  await signIn(page, email);
  const id = await userIdFor(email);
  const [row] = (await adminRest("POST", "applications", [{ user_id: id, title: "Alpha Role", company: "Co", stage: "interviewing" }])) as { id: string }[];
  await context.addCookies([{ name: "locale", value: "fr-CA", url: "http://localhost:3000" }]);
  await page.goto(`/applications/${row.id}`);
  await expect(page.getByText("Chronologie", { exact: true })).toBeVisible();
  await expect(page.getByText("Rappels", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Ajouter une entrevue" })).toBeVisible();
  await expect(page.getByRole("link", { name: /Préparation d'entrevue/ })).toBeVisible();
});
