import { ProfilePage } from "../pages/ProfilePage";
import { companyTest } from "./companyTest";

export const profilePageTest = companyTest.extend<{ profilePage: ProfilePage }>(
  {
    profilePage: async ({ page }, use) => {
      await use(new ProfilePage(page));
    },
  },
);
