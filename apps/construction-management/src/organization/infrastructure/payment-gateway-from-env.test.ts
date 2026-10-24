import { afterEach, describe, expect, it, vi } from "vitest";

import { FakePaymentGateway } from "./fake-payment-gateway";
import { paymentGatewayFromEnv } from "./payment-gateway-from-env";
import { RazorpayGateway } from "./razorpay";

describe("paymentGatewayFromEnv", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("is null until a key id and secret are set", () => {
    vi.stubEnv("RAZORPAY_KEY_ID", "");
    vi.stubEnv("RAZORPAY_KEY_SECRET", "");
    expect(paymentGatewayFromEnv()).toBeNull();
  });

  it("uses Razorpay for a real key id", () => {
    vi.stubEnv("RAZORPAY_KEY_ID", "rzp_test_abc");
    vi.stubEnv("RAZORPAY_KEY_SECRET", "secret");
    expect(paymentGatewayFromEnv()).toBeInstanceOf(RazorpayGateway);
  });

  it("uses the fake gateway for rzp_test_fake on a preview build, never in live production", () => {
    vi.stubEnv("RAZORPAY_KEY_ID", "rzp_test_fake");
    vi.stubEnv("RAZORPAY_KEY_SECRET", "e2e-secret");
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("VERCEL_ENV", "preview");
    const gateway = paymentGatewayFromEnv();
    expect(gateway).toBeInstanceOf(FakePaymentGateway);
    expect((gateway as FakePaymentGateway).keySecret).toBe("e2e-secret");

    vi.stubEnv("VERCEL_ENV", "production");
    expect(() => paymentGatewayFromEnv()).toThrow(
      "The fake payment gateway must not run in production.",
    );
  });
});
