import { SubscriptionPage } from "../pages/SubscriptionPage";
import { companyTest } from "./companyTest";

export const subscriptionPageTest = companyTest.extend<{
  subscriptionPage: SubscriptionPage;
}>({
  subscriptionPage: async ({ page }, use) => {
    await use(new SubscriptionPage(page));
  },
});
