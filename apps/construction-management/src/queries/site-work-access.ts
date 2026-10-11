import { queryOptions } from "@tanstack/react-query";

import type {
  GetConstructionSiteWorkAccessResponseModel,
  SiteWorkAccessMenu,
} from "@/app/api/construction/site-work/access/access-models";
import type { Flag } from "@/src/shared-kernel/access";

import { apiJson } from "./http";

export type SiteWorkAccess = GetConstructionSiteWorkAccessResponseModel;

export const SITE_WORK_API = "/api/construction/site-work";

/** Every site-work query key starts here (M6). */
export const SITE_WORK_KEY = ["site-work"] as const;

/**
 * What the viewer may do in site work, on a Project when given (Company
 * menus otherwise). Screens hide actions by it; routes check again.
 */
export function siteWorkAccessQuery(projectId: string | null) {
  return queryOptions({
    queryKey: [...SITE_WORK_KEY, "access", projectId ?? "company"] as const,
    queryFn: () =>
      apiJson<SiteWorkAccess>(
        `${SITE_WORK_API}/access${projectId == null ? "" : `?projectId=${encodeURIComponent(projectId)}`}`,
      ),
    staleTime: 60_000,
  });
}

export function canInSiteWork(
  access: SiteWorkAccess,
  menu: SiteWorkAccessMenu,
  flag: Flag,
): boolean {
  return access.menus[menu].includes(flag);
}
