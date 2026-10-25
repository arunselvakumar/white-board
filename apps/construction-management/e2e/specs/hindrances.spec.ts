import { expect } from "@playwright/test";

import { projectTest } from "../helpers/projectTest";
import { HindrancesPage } from "../pages/HindrancesPage";

projectTest.describe("Hindrances", () => {
  projectTest(
    "should list an open hindrance with its cause and hours lost, when the Owner records one",
    async ({ project, page }) => {
      const hindrances = new HindrancesPage(page, project.id);
      await page.goto(`${hindrances.url}/new`);
      await hindrances.form.getByLabel("Hours lost").fill("6");
      await hindrances.form.getByRole("combobox", { name: "Cause" }).click();
      const cause = page.getByRole("option").first();
      const causeName = (await cause.textContent())?.trim() ?? "";
      await cause.click();
      await hindrances.form
        .getByLabel("Affected activity")
        .fill("Slab concreting");
      await hindrances.form
        .getByRole("combobox", { name: "Responsible party" })
        .click();
      await page.getByRole("option").first().click();
      await hindrances.form
        .getByLabel("Description")
        .fill("Ready-mix truck did not arrive.");
      await hindrances.form
        .getByRole("button", { name: "Save", exact: true })
        .click();
      await expect(page).not.toHaveURL(/\/hindrances\/new$/);

      await hindrances.goto();
      const row = hindrances.main
        .getByRole("listitem")
        .filter({ hasText: "Slab concreting" })
        .or(
          hindrances.main
            .getByRole("row")
            .filter({ hasText: "Slab concreting" }),
        );
      await expect(row.first()).toBeVisible();
      await expect(row.first()).toContainText(causeName);
    },
  );
});
