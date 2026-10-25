import { expect } from "@playwright/test";

import { emailCodeFor } from "../api/mailpit";
import { PASSWORD, newEmail, signUpByEmail, unique } from "../api/session";
import { signUpPageTest } from "../helpers/signUpPageTest";
import { CreateCompanyPage } from "../pages/CreateCompanyPage";
import { ProjectsPage } from "../pages/ProjectsPage";
import { SignInPage } from "../pages/SignInPage";

signUpPageTest.describe("Sign up", () => {
  signUpPageTest(
    "should land on Projects with the new Company active, when a new User signs up by email and creates a Company",
    { tag: ["@pr"] },
    async ({ signUpPage, page }) => {
      const email = newEmail("signup");
      const companyName = unique("Sri Murugan Builders");

      await signUpPage.goto();
      await expect(signUpPage.pageHeading).toBeVisible();
      await signUpPage.fillDetails({
        name: "Kavya Raman",
        email,
        password: PASSWORD,
      });
      await expect(page.getByText(`We sent a code to ${email}`)).toBeVisible();
      await signUpPage.enterCode(await emailCodeFor(email));

      const createCompanyPage = new CreateCompanyPage(page);
      await expect(page).toHaveURL(createCompanyPage.url);
      await createCompanyPage.create(companyName);

      const projectsPage = new ProjectsPage(page);
      await expect(page).toHaveURL(projectsPage.url, { timeout: 20_000 });
      await expect(projectsPage.pageHeading).toBeVisible();
      await expect(projectsPage.companySwitcher).toContainText(companyName);
      await expect(projectsPage.emptyState).toBeVisible();
    },
  );

  signUpPageTest(
    "should neither reveal nor replace the account, when someone signs up with an email that already has one",
    async ({ signUpPage, account, page }) => {
      await signUpPage.goto();
      await signUpPage.fillDetails({
        name: "Someone Else",
        email: account.email,
        password: "someone-elses-pass-1",
      });
      // The same next step as for a new email: nothing says the account exists.
      await expect(
        page.getByText(`We sent a code to ${account.email}`),
      ).toBeVisible();

      const signInPage = new SignInPage(page);
      await signInPage.goto();
      await signInPage.signInByEmail(account.email, "someone-elses-pass-1");
      await expect(signInPage.formAlert).toBeVisible();
      await signInPage.signInByEmail(account.email, account.password);
      await expect(page).toHaveURL(new ProjectsPage(page).url);
    },
  );

  signUpPageTest(
    "should open Create Company, when a signed-in User with no Company opens Choose Company",
    async ({ page }) => {
      await signUpByEmail(page.request, {
        name: "No Company Yet",
        email: newEmail("nocompany"),
      });
      await page.goto("/choose-company");
      const createCompanyPage = new CreateCompanyPage(page);
      await expect(page).toHaveURL(createCompanyPage.url);
      await expect(createCompanyPage.companyNameField).toBeVisible();
    },
  );
});
