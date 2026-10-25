import { RolesPage } from "../pages/RolesPage";
import { companyTest } from "./companyTest";

export const rolesPageTest = companyTest.extend<{ rolesPage: RolesPage }>({
  rolesPage: async ({ page }, use) => {
    await use(new RolesPage(page));
  },
});
