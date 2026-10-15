import { queryOptions } from "@tanstack/react-query";

import type {
  GetConstructionTrackingAccessResponseModel,
  TrackingAccessMenu,
} from "@/app/api/construction/tracking/access/access-models";
import type { Flag } from "@/src/shared-kernel/access";

import { apiJson } from "./http";

export type TrackingAccess = GetConstructionTrackingAccessResponseModel;

export const TRACKING_API = "/api/construction/tracking";

/** Every tracking query key starts here (M8). */
export const TRACKING_KEY = ["tracking"] as const;

/**
 * What the viewer may do in tracking on a Project. Screens hide actions by
 * it; routes check again.
 */
export function trackingAccessQuery(projectId: string) {
  return queryOptions({
    queryKey: [...TRACKING_KEY, "access", projectId] as const,
    queryFn: () =>
      apiJson<TrackingAccess>(
        `${TRACKING_API}/access?projectId=${encodeURIComponent(projectId)}`,
      ),
    staleTime: 60_000,
  });
}

export function canInTracking(
  access: TrackingAccess,
  menu: TrackingAccessMenu,
  flag: Flag,
): boolean {
  return access.menus[menu].includes(flag);
}
