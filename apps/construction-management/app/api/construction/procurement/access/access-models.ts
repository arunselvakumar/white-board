import { z } from "zod";

import { FLAGS } from "@/src/shared-kernel/access";

/** Optional Project the project-level menus are checked against. */
export const GetConstructionProcurementAccessRequestModel = z.object({
  projectId: z.uuid().optional(),
});

/** The procurement and materials menus a screen hides actions by (M5). */
export const PROCUREMENT_ACCESS_MENUS = [
  "procurement.manage_materials",
  "procurement.current_inventory",
  "procurement.purchase_requests",
  "procurement.purchase_orders",
  "procurement.material_received",
  "procurement.material_transfers",
  "procurement.central_inventory",
  "procurement.central_store",
  "procurement.material_requests",
  "procurement.delivery_notes",
  "masters.materials",
  "masters.suppliers",
  "masters.terms_conditions",
] as const;
export type ProcurementAccessMenu = (typeof PROCUREMENT_ACCESS_MENUS)[number];

export const GetConstructionProcurementAccessResponseModel = z
  .object({
    projectId: z.uuid().nullable(),
    menus: z.record(z.enum(PROCUREMENT_ACCESS_MENUS), z.array(z.enum(FLAGS))),
  })
  .meta({
    description:
      "For each procurement menu, the flags the caller holds (on the Project when one is given and the menu is project-level). The UI hides what is missing; every route checks again.",
  });
export type GetConstructionProcurementAccessResponseModel = z.infer<
  typeof GetConstructionProcurementAccessResponseModel
>;
