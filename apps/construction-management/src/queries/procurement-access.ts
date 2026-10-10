import { queryOptions } from "@tanstack/react-query";

import type {
  GetConstructionProcurementAccessResponseModel,
  ProcurementAccessMenu,
} from "@/app/api/construction/procurement/access/access-models";
import type { Flag } from "@/src/shared-kernel/access";

import { apiJson } from "./http";

export type ProcurementAccess = GetConstructionProcurementAccessResponseModel;

export const PROCUREMENT_API = "/api/construction/procurement";

/** Every procurement query key starts here (M5). */
export const PROCUREMENT_KEY = ["procurement"] as const;

/**
 * What the viewer may do in procurement, on a Project when given (Company
 * menus otherwise). Screens hide actions by it; routes check again.
 */
export function procurementAccessQuery(projectId: string | null) {
  return queryOptions({
    queryKey: [...PROCUREMENT_KEY, "access", projectId ?? "company"] as const,
    queryFn: () =>
      apiJson<ProcurementAccess>(
        `${PROCUREMENT_API}/access${projectId == null ? "" : `?projectId=${encodeURIComponent(projectId)}`}`,
      ),
    staleTime: 60_000,
  });
}

export function canIn(
  access: ProcurementAccess,
  menu: ProcurementAccessMenu,
  flag: Flag,
): boolean {
  return access.menus[menu].includes(flag);
}
