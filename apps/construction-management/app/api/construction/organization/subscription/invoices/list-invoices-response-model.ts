import { z } from "zod";

import { ORDER_KINDS } from "@/src/organization/domain/checkout";

export const ListConstructionOrganizationInvoicesResponseModel = z.object({
  items: z.array(
    z.object({
      id: z.uuid(),
      invoiceNumber: z.string(),
      kind: z.enum(ORDER_KINDS),
      planName: z.string(),
      months: z.number().int().nullable(),
      paidAt: z.iso.datetime(),
      totalPaise: z.number().int(),
      currency: z.string().length(3),
      pdfPath: z.string(),
    }),
  ),
  nextCursor: z.string().nullable(),
  prevCursor: z.string().nullable(),
  total: z.number().int(),
});

export type ListConstructionOrganizationInvoicesResponseModel = z.infer<
  typeof ListConstructionOrganizationInvoicesResponseModel
>;
