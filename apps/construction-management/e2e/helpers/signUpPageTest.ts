import { SignUpPage } from "../pages/SignUpPage";
import { guestTest } from "./guestTest";

export const signUpPageTest = guestTest.extend<{ signUpPage: SignUpPage }>({
  signUpPage: async ({ page }, use) => {
    await use(new SignUpPage(page));
  },
});
