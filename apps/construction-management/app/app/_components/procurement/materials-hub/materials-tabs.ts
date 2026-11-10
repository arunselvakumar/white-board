import type { ProcurementAccessMenu } from "@/app/api/construction/procurement/access/access-models";

/**
 * The tabs of a Project's Materials module (M5), in order. `segment` is
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

export function materialsPath(
  projectId: string,
  segment: MaterialsTabSegment,
): string {
  return `/app/projects/${encodeURIComponent(projectId)}/materials/${segment}`;
}
