import { MarketingPage } from "../pages/MarketingPage";
import { companyTest } from "./companyTest";

export const marketingPageTest = companyTest.extend<{
  marketingPage: MarketingPage;
}>({
  marketingPage: async ({ page }, use) => {
    await use(new MarketingPage(page));
  },
});
