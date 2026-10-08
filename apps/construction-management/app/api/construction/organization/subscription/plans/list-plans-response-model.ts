import { z } from "zod";

import { planGrantField } from "../subscription-fields";

const count = z.number().int();

export const ListConstructionOrganizationPlansResponseModel = z.object({
  version: z.number().int().describe("Catalogue version stored on orders"),
  currency: z.string().length(3),
  gstRatePercent: z.number().int(),
  paymentsConfigured: z.boolean(),
  plans: z.array(
    z.object({
      code: z.string(),
      name: z.string(),
      rank: z.number().int(),
      durations: z.array(
        z.object({
          months: z.number().int(),
          pricePaise: z.number().int().describe("Before GST"),
        }),
      ),
      includes: z.object({
        project: count,
        team_member: count,
        hrms_member: count,
        storage_gb: count,
      }),
    }),
  ),
  addOns: z.array(
    z.object({
      grant: planGrantField,
      name: z.string(),
      unitSize: z.number().int(),
      pricePerUnitPerMonthPaise: z.number().int(),
      minimumQuantity: z.number().int(),
    }),
  ),
});

export type ListConstructionOrganizationPlansResponseModel = z.infer<
  typeof ListConstructionOrganizationPlansResponseModel
>;
