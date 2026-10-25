import { AddStaffPage } from "../pages/AddStaffPage";
import { companyTest } from "./companyTest";

export const addStaffPageTest = companyTest.extend<{
  addStaffPage: AddStaffPage;
}>({
  addStaffPage: async ({ page }, use) => {
    await use(new AddStaffPage(page));
  },
});
