import { describe, expect, it, vi } from "vitest";

import { planCatalogue } from "./plan-catalogue";
import {
  RazorpayGateway,
  RazorpayWebhookVerifier,
  razorpaySignature,
} from "./razorpay";

describe("Razorpay (CM-117)", () => {
  it("verifies webhook bodies and checkout callbacks by HMAC-SHA256", () => {
    const body = '{"event":"payment.captured"}';
    const verifier = new RazorpayWebhookVerifier("whsec");
    expect(verifier.verify(body, razorpaySignature(body, "whsec"))).toBe(true);
    expect(verifier.verify(`${body} `, razorpaySignature(body, "whsec"))).toBe(
      false,
    );
    expect(verifier.verify(body, null)).toBe(false);
    expect(new RazorpayWebhookVerifier("").verify(body, "")).toBe(false);

    const gateway = new RazorpayGateway("rzp_test_1", "key-secret");
    const signature = razorpaySignature("order_1|pay_1", "key-secret");
    expect(
      gateway.verifyPaymentSignature({
        orderId: "order_1",
        paymentId: "pay_1",
        signature,
      }),
    ).toBe(true);
    expect(
      gateway.verifyPaymentSignature({
        orderId: "order_2",
        paymentId: "pay_1",
        signature,
      }),
    ).toBe(false);
  });

  it("creates orders with basic auth in paise", async () => {
    const fetchMock = vi.fn((_url: string, _init: RequestInit) =>
      Promise.resolve(
        Response.json({ id: "order_9", amount: 165200, currency: "INR" }),
      ),
    );
    const gateway = new RazorpayGateway("rzp_test_1", "secret", fetchMock);
    await expect(
      gateway.createOrder(165200, "receipt-1", { plan: "basic" }),
    ).resolves.toEqual({ id: "order_9", amount: 165200, currency: "INR" });
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe("https://api.razorpay.com/v1/orders");
    expect(new Headers(init?.headers).get("authorization")).toBe(
      `Basic ${Buffer.from("rzp_test_1:secret").toString("base64")}`,
    );
    expect(JSON.parse(init?.body as string)).toEqual({
      amount: 165200,
      currency: "INR",
      receipt: "receipt-1",
      notes: { plan: "basic" },
    });
  });

  it("ships a valid plan catalogue with Basic", () => {
    const basic = planCatalogue.plan("basic");
    expect(basic.durations).toEqual([
      { months: 6, pricePaise: 1_400_000 },
      { months: 12, pricePaise: 2_100_000 },
    ]);
    expect(basic.includes).toEqual({
      project: 10,
      team_member: 5,
      hrms_member: 10,
      storage_gb: 20,
    });
    expect(planCatalogue.addOn("hrms_member")?.pricePerUnitPerMonthPaise).toBe(
      3000,
    );
  });
});
