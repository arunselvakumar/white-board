import type { SiteWorkAccessMenu } from "@/app/api/construction/site-work/access/access-models";
import { type AppHref, type HrefSuffix, pageHref } from "@/lib/page-href";

/**
 * The tabs of a Project's Equipment module, in order. `segment` is the path
 * under `/app/projects/<id>/equipment/`; a tab shows when the viewer has
 * Read on one of its menus. The Equipment tab is the register's view of the
 * Project.
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

/** Each tab's page, named by its folder (ADR CM-0045). */
const EQUIPMENT_TAB_PAGES: Record<
  EquipmentTabSegment,
  (id: string) => AppHref
> = {
  "usage-sheets": (id) =>
    pageHref("/app/projects/[id]/equipment/usage-sheets", { id }),
  register: (id) => pageHref("/app/projects/[id]/equipment/register", { id }),
};

export function equipmentModulePath(
  projectId: string,
  segment: EquipmentTabSegment,
): AppHref {
  return EQUIPMENT_TAB_PAGES[segment](projectId);
}

/** A machine's detail page inside a Project's Equipment module. */
export function projectEquipmentPath(
  projectId: string,
  equipmentId: string,
  suffix: HrefSuffix = "",
): AppHref {
  return pageHref(
    "/app/projects/[id]/equipment/register/[equipmentId]",
    { id: projectId, equipmentId },
    suffix,
  );
}

/** The register's pages, under Masters. */
export const EQUIPMENTS_PATH = "/app/masters/equipments";

export function equipmentPath(id: string, suffix: HrefSuffix = ""): AppHref {
  return pageHref("/app/masters/equipments/[id]", { id }, suffix);
}
