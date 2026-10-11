import { z } from "zod";

import { FLAGS } from "@/src/shared-kernel/access";

/** Optional Project the project-level menus are checked against. */
export const GetConstructionSiteWorkAccessRequestModel = z.object({
  projectId: z.uuid().optional(),
});

/** The site-work menus a screen hides actions by (M6, ADR CM-0016). */
export const SITE_WORK_ACCESS_MENUS = [
  "site_work.daily_worksheet",
  "site_work.equipment_usage",
  "site_work.site_diary",
  "site_work.hindrances",
  "site_work.progress_reports",
  "masters.equipments",
  "masters.work_types",
] as const;
export type SiteWorkAccessMenu = (typeof SITE_WORK_ACCESS_MENUS)[number];

export const GetConstructionSiteWorkAccessResponseModel = z
  .object({
    projectId: z.uuid().nullable(),
    menus: z.record(z.enum(SITE_WORK_ACCESS_MENUS), z.array(z.enum(FLAGS))),
  })
  .meta({
    description:
      "For each site-work menu, the flags the caller holds (on the Project when one is given and the menu is project-level). The UI hides what is missing; every route checks again.",
  });
export type GetConstructionSiteWorkAccessResponseModel = z.infer<
  typeof GetConstructionSiteWorkAccessResponseModel
>;
