import { AddUserPage } from "../pages/AddUserPage";
import { companyTest } from "./companyTest";

export const addUserPageTest = companyTest.extend<{ addUserPage: AddUserPage }>(
  {
    addUserPage: async ({ page }, use) => {
      await use(new AddUserPage(page));
    },
  },
);
