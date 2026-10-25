import { CheckoutPage } from "../pages/CheckoutPage";
import { companyTest } from "./companyTest";

export const checkoutPageTest = companyTest.extend<{
  checkoutPage: CheckoutPage;
}>({
  checkoutPage: async ({ page }, use) => {
    await use(new CheckoutPage(page));
  },
});
