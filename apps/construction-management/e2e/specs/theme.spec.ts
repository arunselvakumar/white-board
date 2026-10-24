import { expect } from "@playwright/test";

import { projectsPageTest } from "../helpers/projectsPageTest";

projectsPageTest.describe("Theme", () => {
  projectsPageTest(
    "should draw the app dark, when the User picked the dark theme",
    async ({ projectsPage, page }) => {
      await page.addInitScript(() => {
        localStorage.setItem("construction-theme", "dark");
      });
      await projectsPage.goto();
      await expect(projectsPage.pageHeading).toBeVisible();
      await expect(page.locator("html")).toHaveClass(/\bdark\b/);
      const background = await page.evaluate(
        () => getComputedStyle(document.body).backgroundColor,
      );
      const [red = 255, green = 255, blue = 255] = (
        background.match(/\d+/g) ?? []
      ).map(Number);
      expect(red + green + blue).toBeLessThan(200);
    },
  );
});
