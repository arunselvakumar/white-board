import { SignInAsPage } from "../pages/SignInAsPage";
import { guestTest } from "./guestTest";

export const signInAsPageTest = guestTest.extend<{
  signInAsPage: SignInAsPage;
}>({
  signInAsPage: async ({ page }, use) => {
    await use(new SignInAsPage(page));
  },
});
