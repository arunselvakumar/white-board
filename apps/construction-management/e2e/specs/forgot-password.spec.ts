import { expect } from "@playwright/test";

import { emailCodeFor } from "../api/mailpit";
import { forgotPasswordPageTest } from "../helpers/forgotPasswordPageTest";
import { ProjectsPage } from "../pages/ProjectsPage";
import { SignInPage } from "../pages/SignInPage";

forgotPasswordPageTest.describe("Forgot password", () => {
  forgotPasswordPageTest(
    "should sign in with the new password, when the Owner resets it with the emailed code",
    async ({ forgotPasswordPage, account, page }) => {
      const newPassword = "brand-new-pass-9012";

      await forgotPasswordPage.goto();
      await forgotPasswordPage.requestCode(account.email);
      await expect(forgotPasswordPage.codeInput).toBeVisible();
      await forgotPasswordPage.reset(
        await emailCodeFor(account.email, "password reset"),
        newPassword,
      );
      await expect(
        page.getByText("Your password has been reset"),
      ).toBeVisible();
      await forgotPasswordPage.button("Sign in").click();

      const signInPage = new SignInPage(page);
      await signInPage.signInByEmail(account.email, account.password);
      await expect(signInPage.formAlert).toBeVisible();
      await signInPage.signInByEmail(account.email, newPassword);
      await expect(page).toHaveURL(new ProjectsPage(page).url);
    },
  );
});
