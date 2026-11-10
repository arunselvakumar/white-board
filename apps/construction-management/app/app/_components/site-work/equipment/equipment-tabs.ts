import type { SiteWorkAccessMenu } from "@/app/api/construction/site-work/access/access-models";

/**
 * The tabs of a Project's Equipment module (M6), in order. `segment` is
 * the path under `/app/projects/<id>/equipment/`; a tab shows when the
 * viewer has Read on one of its menus. Usage sheets are CM-604's; the
 * Equipment tab is the register's view of the Project (CM-603).
 */
export const EQUIPMENT_TABS = [
  {
    segment: "usage-sheets",
    label: "Usage sheets",
    menus: ["site_work.equipment_usage"],
  },
  {
    segment: "register",
    label: "Equipment",
    menus: ["site_work.equipment_usage", "masters.equipments"],
  },
] as const satisfies readonly {
  segment: string;
  label: string;
  menus: readonly SiteWorkAccessMenu[];
}[];

export type EquipmentTabSegment = (typeof EQUIPMENT_TABS)[number]["segment"];

export function equipmentModulePath(
  projectId: string,
  segment: EquipmentTabSegment,
): string {
  return `/app/projects/${encodeURIComponent(projectId)}/equipment/${segment}`;
}

/** A machine's detail page inside a Project's Equipment module. */
export function projectEquipmentPath(
  projectId: string,
  equipmentId: string,
): string {
  return `${equipmentModulePath(projectId, "register")}/${encodeURIComponent(equipmentId)}`;
}

/** The register's pages under Masters → Equipments. */
export const EQUIPMENTS_PATH = "/app/masters/equipments";

export function equipmentPath(id: string): string {
  return `${EQUIPMENTS_PATH}/${encodeURIComponent(id)}`;
}
