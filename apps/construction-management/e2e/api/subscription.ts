import { createHmac } from "node:crypto";

import { e2eEnv } from "../../playwright.config";
import type { ApiClient } from "./ApiClient";

const SUBSCRIPTION = "/api/construction/organization/subscription";

/**
 * Buys `planCode` for its shortest duration through the real checkout API,
 * paying with a payment signed as the fake gateway expects (e2e.env).
 */
export async function buyPlan(
  api: ApiClient,
  planCode = "basic",
): Promise<{ invoiceNumber: string | null }> {
  const { plans } = await api.get<{
    plans: { code: string; durations: { months: number }[] }[];
  }>(`${SUBSCRIPTION}/plans`);
  const months = Math.min(
    ...(plans.find((plan) => plan.code === planCode)?.durations ?? []).map(
      (duration) => duration.months,
    ),
  );
  const started = await api.post<{ razorpay: { orderId: string } }>(
    `${SUBSCRIPTION}/checkout`,
    {
      kind: "new",
      planCode,
      months,
      billingAddress: {
        name: "Anugraha Engineers",
        address: "12 Anna Salai, Chennai",
        stateCode: "33",
        gstin: null,
      },
    },
  );
  const orderId = started.razorpay.orderId;
  const paymentId = `pay_e2e_${String(Date.now())}`;
  const signature = createHmac("sha256", e2eEnv["RAZORPAY_KEY_SECRET"] ?? "")
    .update(`${orderId}|${paymentId}`)
    .digest("hex");
  return api.post(`${SUBSCRIPTION}/checkout/verify`, {
    razorpayOrderId: orderId,
    razorpayPaymentId: paymentId,
    razorpaySignature: signature,
  });
}

/** The plan's limits, e.g. how many Projects it allows. */
export async function planLimits(
  api: ApiClient,
): Promise<Record<string, number | null>> {
  const subscription = await api.get<{
    usage?: { grant: string; limit: number | null }[];
  }>(SUBSCRIPTION);
  return Object.fromEntries(
    (subscription.usage ?? []).map((item) => [item.grant, item.limit]),
  );
}
