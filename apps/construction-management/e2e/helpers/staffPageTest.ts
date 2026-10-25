import { StaffPage } from "../pages/StaffPage";
import { companyTest } from "./companyTest";

export const staffPageTest = companyTest.extend<{ staffPage: StaffPage }>({
  staffPage: async ({ page }, use) => {
    await use(new StaffPage(page));
  },
});
