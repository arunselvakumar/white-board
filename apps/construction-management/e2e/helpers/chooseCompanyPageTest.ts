import { ChooseCompanyPage } from "../pages/ChooseCompanyPage";
import { guestTest } from "./guestTest";

export const chooseCompanyPageTest = guestTest.extend<{
  chooseCompanyPage: ChooseCompanyPage;
}>({
  chooseCompanyPage: async ({ page }, use) => {
    await use(new ChooseCompanyPage(page));
  },
});
