import { DesignationsPage } from "../pages/DesignationsPage";
import { companyTest } from "./companyTest";

export const designationsPageTest = companyTest.extend<{
  designationsPage: DesignationsPage;
}>({
  designationsPage: async ({ page }, use) => {
    await use(new DesignationsPage(page));
  },
});
