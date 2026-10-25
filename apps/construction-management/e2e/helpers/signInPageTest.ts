import { SignInPage } from "../pages/SignInPage";
import { guestTest } from "./guestTest";

export const signInPageTest = guestTest.extend<{ signInPage: SignInPage }>({
  signInPage: async ({ page }, use) => {
    await use(new SignInPage(page));
  },
});
