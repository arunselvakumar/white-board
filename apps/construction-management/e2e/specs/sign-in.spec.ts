import { expect } from "@playwright/test";

import { addMember, roleId } from "../api/organization";
import { newMobile } from "../api/session";
import { signInPageTest } from "../helpers/signInPageTest";
import { ChangePasswordPage } from "../pages/ChangePasswordPage";
import { ProjectsPage } from "../pages/ProjectsPage";

signInPageTest.describe("Sign in", () => {
  signInPageTest(
    "should refuse a wrong password and then sign in, when the Owner signs in by email",
    { tag: ["@pr"] },
    async ({ signInPage, account, page }) => {
      await signInPage.goto();
      await signInPage.signInByEmail(account.email, "not-the-password");
      await expect(signInPage.formAlert).toContainText(/invalid|incorrect/i);
      await expect(page).toHaveURL(/\/sign-in/);

      await signInPage.signInByEmail(account.email, account.password);
      const projectsPage = new ProjectsPage(page);
      await expect(page).toHaveURL(projectsPage.url);
      await expect(projectsPage.companySwitcher).toContainText(
        account.company.name,
      );
    },
  );

  signInPageTest(
    "should return to the page that was asked for, when a signed-out visitor opens a deep link and signs in",
    { tag: ["@pr"] },
    async ({ signInPage, account, page }) => {
      await page.goto("/app/settings");
      await expect(page).toHaveURL(/\/sign-in\?redirect_url=%2Fapp%2Fsettings/);

      await signInPage.signInByEmail(account.email, account.password);
      await expect(page).toHaveURL("/app/settings");
    },
  );

  signInPageTest(
    "should ask for a new password first, when a member signs in by mobile with the password the Owner set",
    { tag: ["@pr", "@mobile"] },
    async ({ signInPage, account, page }) => {
      const mobile = newMobile();
      const member = await addMember(account.api, {
        roleId: await roleId(account.api, "Site Engineer"),
        email: null,
        mobile,
      });

      await signInPage.goto();
      await signInPage.signInByMobile(
        mobile.slice(3),
        member.temporaryPassword,
      );

      const changePasswordPage = new ChangePasswordPage(page);
      await expect(page).toHaveURL(changePasswordPage.url);
      await expect(changePasswordPage.pageHeading).toBeVisible();
      await changePasswordPage.change(
        member.temporaryPassword,
        "my-own-pass-5678",
      );

      const projectsPage = new ProjectsPage(page);
      await expect(page).toHaveURL(projectsPage.url);
      await expect(projectsPage.companySwitcher).toContainText(
        account.company.name,
      );
    },
  );

  signInPageTest(
    "should keep a member on Change password, when they try to open the app before choosing their own password",
    async ({ signInPage, account, page }) => {
      const mobile = newMobile();
      const member = await addMember(account.api, {
        roleId: await roleId(account.api, "Site Engineer"),
        email: null,
        mobile,
      });
      await signInPage.goto();
      await signInPage.signInByMobile(
        mobile.slice(3),
        member.temporaryPassword,
      );
      const changePasswordPage = new ChangePasswordPage(page);
      await expect(page).toHaveURL(changePasswordPage.url);

      await page.goto("/app/projects");
      await expect(page).toHaveURL(changePasswordPage.url);
    },
  );
});
