import { z } from "zod";

import { FLAGS } from "@/src/shared-kernel/access";

/** The Project the tracking menus are checked on. */
export const GetConstructionTrackingAccessRequestModel = z.object({
  projectId: z.uuid(),
});

/**
 * The menus tracking screens hide actions by (M8, ADR CM-0019): the three
 * tracking menus on the Project, and Tags (Company-level) for the Task
 * form's inline tag create.
 */
export const TRACKING_ACCESS_MENUS = [
  "tracking.tasks",
  "tracking.issues",
  "tracking.inspection_requests",
  "masters.tags",
] as const;
export type TrackingAccessMenu = (typeof TRACKING_ACCESS_MENUS)[number];

export const GetConstructionTrackingAccessResponseModel = z
  .object({
    projectId: z.uuid(),
    menus: z.record(z.enum(TRACKING_ACCESS_MENUS), z.array(z.enum(FLAGS))),
  })
  .meta({
    description:
      "For each tracking menu, the flags the caller holds on the Project (Tags: in the Company). The UI hides what is missing; every route checks again.",
  });
export type GetConstructionTrackingAccessResponseModel = z.infer<
  typeof GetConstructionTrackingAccessResponseModel
>;
