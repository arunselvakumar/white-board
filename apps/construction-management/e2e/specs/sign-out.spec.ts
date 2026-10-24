import { expect } from "@playwright/test";

import { projectsPageTest } from "../helpers/projectsPageTest";
import { SignInPage } from "../pages/SignInPage";

projectsPageTest.describe("Sign out", () => {
  projectsPageTest(
    "should end the session, when the Owner signs out from the account menu",
    { tag: ["@pr"] },
    async ({ projectsPage, page }) => {
      await projectsPage.goto();
      await projectsPage.signOut();

      const signInPage = new SignInPage(page);
      await expect(page).toHaveURL(/\/sign-in/);
      await expect(signInPage.pageHeading).toBeVisible();

      await page.goBack();
      await page.goto(projectsPage.url);
      await expect(page).toHaveURL(/\/sign-in/);
    },
  );
});
