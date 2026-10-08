import { z } from "zod";

export const ReceiveConstructionOrganizationRazorpayWebhookResponseModel =
  z.object({
    received: z.literal(true),
    result: z
      .string()
      .describe(
        "paid, already_paid, failed, not_found, amount_mismatch or ignored",
      ),
  });

export type ReceiveConstructionOrganizationRazorpayWebhookResponseModel =
  z.infer<typeof ReceiveConstructionOrganizationRazorpayWebhookResponseModel>;
