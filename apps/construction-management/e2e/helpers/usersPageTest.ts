import { UsersPage } from "../pages/UsersPage";
import { companyTest } from "./companyTest";

export const usersPageTest = companyTest.extend<{ usersPage: UsersPage }>({
  usersPage: async ({ page }, use) => {
    await use(new UsersPage(page));
  },
});
