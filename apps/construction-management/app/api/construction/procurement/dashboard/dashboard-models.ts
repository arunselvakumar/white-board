import { z } from "zod";

/** The Project Dashboard's materials read (CM-510): a Project and a duration. */
export const GetConstructionProcurementDashboardRequestModel = z
  .object({
    projectId: z.uuid(),
    from: z.iso.date(),
    to: z.iso.date(),
  })
  .refine((value) => value.from <= value.to, {
    message: "From must be on or before To.",
    path: ["from"],
  });

export const GetConstructionProcurementDashboardResponseModel = z
  .object({
    /** Null without Current Inventory read on the Project. */
    materials: z
      .object({
        total: z.int(),
        inStock: z.int(),
        lowStock: z.int(),
        outOfStock: z.int(),
      })
      .nullable(),
    /** Null without Purchase Order read on the Project. */
    purchaseOrders: z
      .object({
        count: z.int(),
        /** Paise. */
        value: z.int(),
        months: z.array(z.object({ month: z.string(), value: z.int() })),
      })
      .nullable(),
    /**
     * Pending documents the caller may approve on the Project; a count is
     * null without that document's Approve flag.
     */
    approvals: z.object({
      purchaseRequests: z.int().nullable(),
      purchaseOrders: z.int().nullable(),
      transfers: z.int().nullable(),
      total: z.int(),
    }),
  })
  .meta({
    description:
      "The Project Dashboard's Materials section and Material Approvals KPI (CM-510).",
  });
export type GetConstructionProcurementDashboardResponseModel = z.infer<
  typeof GetConstructionProcurementDashboardResponseModel
>;
