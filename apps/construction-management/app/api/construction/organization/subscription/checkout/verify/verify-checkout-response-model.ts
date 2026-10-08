import { z } from "zod";

export const VerifyConstructionOrganizationCheckoutResponseModel = z.object({
  orderId: z.uuid(),
  status: z.enum(["created", "paid", "failed"]),
  invoiceNumber: z.string().nullable(),
});

export type VerifyConstructionOrganizationCheckoutResponseModel = z.infer<
  typeof VerifyConstructionOrganizationCheckoutResponseModel
>;
