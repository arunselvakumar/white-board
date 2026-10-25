import { expect } from "@playwright/test";

import { installFakeRazorpay } from "../api/razorpay";
import { checkoutPageTest } from "../helpers/checkoutPageTest";
import { SubscriptionPage } from "../pages/SubscriptionPage";

checkoutPageTest.describe("Subscription checkout", () => {
  checkoutPageTest(
    "should activate the plan and list a tax invoice, when the Owner pays for Basic",
    { tag: ["@pr"] },
    async ({ checkoutPage, owner, page }) => {
      await installFakeRazorpay(page);
      await checkoutPage.goto();
      await checkoutPage.plan("Basic").check();
      await checkoutPage.continueButton.click();
      await expect(checkoutPage.step).toContainText("Step 2");
      await checkoutPage.continueToPay({
        name: owner.company.name,
        address: "12 Anna Salai, Chennai",
      });
      await checkoutPage.payButton.click();
      await expect(
        page.getByText(/paid|Payment received/i).first(),
      ).toBeVisible();

      const subscriptionPage = new SubscriptionPage(page);
      await subscriptionPage.goto();
      await expect(subscriptionPage.pageHeading).toBeVisible();
      await expect(subscriptionPage.main).toContainText("Basic");
      await expect(
        subscriptionPage.invoices.getByLabel(/^Download invoice /),
      ).toBeVisible();
    },
  );
});
