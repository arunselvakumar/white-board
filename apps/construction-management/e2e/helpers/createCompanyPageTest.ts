import { CreateCompanyPage } from "../pages/CreateCompanyPage";
import { guestTest } from "./guestTest";

export const createCompanyPageTest = guestTest.extend<{
  createCompanyPage: CreateCompanyPage;
}>({
  createCompanyPage: async ({ page }, use) => {
    await use(new CreateCompanyPage(page));
  },
});
