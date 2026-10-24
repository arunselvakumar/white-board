import { ForgotPasswordPage } from "../pages/ForgotPasswordPage";
import { guestTest } from "./guestTest";

export const forgotPasswordPageTest = guestTest.extend<{
  forgotPasswordPage: ForgotPasswordPage;
}>({
  forgotPasswordPage: async ({ page }, use) => {
    await use(new ForgotPasswordPage(page));
  },
});
