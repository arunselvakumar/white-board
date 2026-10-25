import { randomUUID } from "node:crypto";

import { expect } from "@playwright/test";

import { latestEmailTo } from "../api/mailpit";
import { signInAsPageTest } from "../helpers/signInAsPageTest";
import { ProjectsPage } from "../pages/ProjectsPage";

signInAsPageTest.describe("Sign in as a customer", () => {
  signInAsPageTest(
    "should show the impersonation banner on every page and end on Stop, when support staff sign in as a customer",
    { tag: ["@pr"] },
    async ({ signInAsPage, account, page }) => {
      const admin = `support-${randomUUID().slice(0, 8)}@white-board.io`;

      await signInAsPage.goto();
      await expect(signInAsPage.pageHeading).toBeVisible();
      await signInAsPage.customerEmailField.fill(account.email);
      await signInAsPage.adminEmailField.fill(admin);
      await signInAsPage.sendCodeButton.click();
      const email = await latestEmailTo(admin);
      const code = /\b(\d{6})\b/.exec(email.Subject)?.[1] ?? "";
      await signInAsPage.codeInput.fill(code);
      await signInAsPage.signInAsCustomerButton.click();

      const projectsPage = new ProjectsPage(page);
      await expect(page).toHaveURL(projectsPage.url);
      await expect(projectsPage.companySwitcher).toContainText(
        account.company.name,
      );
      await expect(signInAsPage.impersonationBanner).toContainText(
        account.email,
      );
      await expect(signInAsPage.impersonationBanner).toContainText(admin);

      await page.goto("/app/settings");
      await expect(signInAsPage.impersonationBanner).toBeVisible();

      await signInAsPage.stopButton.click();
      await expect(page).toHaveURL(signInAsPage.url);
      await expect(signInAsPage.impersonationBanner).toHaveCount(0);
      await page.goto(projectsPage.url);
      await expect(page).toHaveURL(/\/sign-in/);
    },
  );
});
