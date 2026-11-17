import type { ProcurementAccessMenu } from "@/app/api/construction/procurement/access/access-models";
import { type AppHref, pageHref } from "@/lib/page-href";

/**
 * The tabs of a Project's Materials module, in order. `segment` is
 * the path under `/app/projects/<id>/materials/`; a tab shows when the
 * viewer has Read on its menu.
 */
export const MATERIALS_TABS = [
  {
    segment: "inventory",
    label: "Current Inventory",
    menu: "procurement.current_inventory",
  },
  {
    segment: "purchase-requests",
    label: "Purchase Requests",
    menu: "procurement.purchase_requests",
  },
  {
    segment: "purchase-orders",
    label: "Purchase Orders",
    menu: "procurement.purchase_orders",
  },
  {
    segment: "goods-received",
    label: "Goods Received",
    menu: "procurement.material_received",
  },
  {
    segment: "transfers",
    label: "Material Transfers",
    menu: "procurement.material_transfers",
  },
  {
    segment: "material-requests",
    label: "Material Requests",
    menu: "procurement.material_requests",
  },
] as const satisfies readonly {
  segment: string;
  label: string;
  menu: ProcurementAccessMenu;
}[];

export type MaterialsTabSegment = (typeof MATERIALS_TABS)[number]["segment"];

/** Each tab's page, named by its folder (ADR CM-0045). */
const MATERIALS_TAB_PAGES: Record<
  MaterialsTabSegment,
  (id: string) => AppHref
> = {
  inventory: (id) => pageHref("/app/projects/[id]/materials/inventory", { id }),
  "purchase-requests": (id) =>
    pageHref("/app/projects/[id]/materials/purchase-requests", { id }),
  "purchase-orders": (id) =>
    pageHref("/app/projects/[id]/materials/purchase-orders", { id }),
  "goods-received": (id) =>
    pageHref("/app/projects/[id]/materials/goods-received", { id }),
  transfers: (id) => pageHref("/app/projects/[id]/materials/transfers", { id }),
  "material-requests": (id) =>
    pageHref("/app/projects/[id]/materials/material-requests", { id }),
};

export function materialsPath(
  projectId: string,
  segment: MaterialsTabSegment,
): AppHref {
  return MATERIALS_TAB_PAGES[segment](projectId);
}
