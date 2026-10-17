import { z } from "zod";

import { FLAGS } from "@/src/shared-kernel/access";

/** The Project the sales menus are checked on. */
export const GetConstructionSalesAccessRequestModel = z.object({
  projectId: z.uuid(),
});

/** The menus sales screens hide actions by (M10, ADR CM-0022 §1). */
export const SALES_ACCESS_MENUS = [
  "sales.inquiries",
  "sales.bookings",
] as const;
export type SalesAccessMenu = (typeof SALES_ACCESS_MENUS)[number];

export const GetConstructionSalesAccessResponseModel = z
  .object({
    projectId: z.uuid(),
    /** Wings (a building) or Locations: Bookings need Wings. */
    structure: z.enum(["wings", "locations"]),
    menus: z.record(z.enum(SALES_ACCESS_MENUS), z.array(z.enum(FLAGS))),
  })
  .meta({
    description:
      "For each sales menu, the flags the caller holds on the Project. The UI hides what is missing; every route checks again.",
  });
export type GetConstructionSalesAccessResponseModel = z.infer<
  typeof GetConstructionSalesAccessResponseModel
>;
