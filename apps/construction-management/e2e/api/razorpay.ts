import { createHmac, randomUUID } from "node:crypto";

import type { Page } from "@playwright/test";

import { e2eEnv } from "../../playwright.config";

/**
 * Stands in for Razorpay's checkout.js: Pay "succeeds" at once with a payment
 * signed by the key secret the server's fake gateway checks (e2e.env), so
 * checkout → verify → invoice runs for real without Razorpay.
 */
export async function installFakeRazorpay(page: Page): Promise<void> {
  const secret = e2eEnv["RAZORPAY_KEY_SECRET"] ?? "";
  await page.exposeFunction("__e2eSignRazorpay", (orderId: string) => {
    const paymentId = `pay_e2e_${randomUUID().slice(0, 12)}`;
    return {
      razorpay_order_id: orderId,
      razorpay_payment_id: paymentId,
      razorpay_signature: createHmac("sha256", secret)
        .update(`${orderId}|${paymentId}`)
        .digest("hex"),
    };
  });
  await page.route("https://checkout.razorpay.com/v1/checkout.js", (route) =>
    route.fulfill({
      contentType: "application/javascript",
      body: `
        window.Razorpay = class {
          constructor(options) { this.options = options; }
          on() {}
          open() {
            window.__e2eSignRazorpay(this.options.order_id)
              .then((paid) => this.options.handler(paid));
          }
        };
      `,
    }),
  );
}
