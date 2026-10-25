import { BackdatedEntryPage } from "../pages/BackdatedEntryPage";
import { companyTest } from "./companyTest";

export const backdatedEntryPageTest = companyTest.extend<{
  backdatedEntryPage: BackdatedEntryPage;
}>({
  backdatedEntryPage: async ({ page }, use) => {
    await use(new BackdatedEntryPage(page));
  },
});
