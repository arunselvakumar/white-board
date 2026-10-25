import { expect } from "@playwright/test";

import { wingsPageTest } from "../helpers/wingsPageTest";
import { AddWingPage } from "../pages/AddWingPage";
import { ProjectDashboardPage } from "../pages/ProjectDashboardPage";

wingsPageTest.describe("Wings", () => {
  wingsPageTest(
    "should make the Wing's floors and units, when the Owner adds a Residential Wing",
    { tag: ["@pr"] },
    async ({ wingsPage, project, page }) => {
      await wingsPage.goto();
      await wingsPage.addWingLink.click();

      const addWingPage = new AddWingPage(page, project.id);
      await addWingPage.choose("Wing Type", "Residential");
      await addWingPage.wingNameField.fill("Wing A");
      await addWingPage.field("Residential floors").fill("4");
      await addWingPage.field("Units per floor").fill("2");
      await page.getByRole("switch", { name: "Terrace floor" }).uncheck();
      await addWingPage.continueToUnitsButton.click();
      await expect(
        page.getByText("Step 2 of 2 · Floors and units"),
      ).toBeVisible();
      await expect(page.getByRole("list", { name: "Floors" })).toBeVisible();
      await addWingPage.button("Save Wing").click();

      await expect(page).toHaveURL(wingsPage.url);
      await expect(wingsPage.wing("Wing A")).toBeVisible();

      const dashboard = new ProjectDashboardPage(page, project.id);
      await dashboard.goto();
      await expect(dashboard.figure("Wings")).toHaveText("1");
      // The ground floor and 4 floors above it, 2 units each, no terrace.
      await expect(dashboard.figure("Units")).toHaveText("10");
    },
  );

  wingsPageTest(
    "should list a second Phase, when the Owner adds one",
    async ({ wingsPage }) => {
      await wingsPage.goto();
      await wingsPage.addPhaseButton.click();
      await wingsPage.dialog.getByRole("textbox").fill("Phase 2");
      await wingsPage.dialog.getByRole("button", { name: /Add|Save/ }).click();
      await expect(wingsPage.heading("Phase 2")).toBeVisible();
    },
  );
});
