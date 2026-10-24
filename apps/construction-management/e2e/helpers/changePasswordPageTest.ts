import { ChangePasswordPage } from "../pages/ChangePasswordPage";
import { guestTest } from "./guestTest";

export const changePasswordPageTest = guestTest.extend<{
  changePasswordPage: ChangePasswordPage;
}>({
  changePasswordPage: async ({ page }, use) => {
    await use(new ChangePasswordPage(page));
  },
});
