import { z } from "zod";

export const GetConstructionOrganizationInvoicePdfParamsModel = z.object({
  id: z.uuid(),
});

export type GetConstructionOrganizationInvoicePdfParamsModel = z.infer<
  typeof GetConstructionOrganizationInvoicePdfParamsModel
>;
