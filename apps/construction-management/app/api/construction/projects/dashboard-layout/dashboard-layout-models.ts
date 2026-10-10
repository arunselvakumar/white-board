import { z } from "zod";

import {
  DASHBOARD_SECTIONS,
  DASHBOARD_SECTION_KEYS,
  type DashboardSectionSetting,
} from "@/src/projects/domain/dashboard-sections";

/**
 * The caller's Project Dashboard layout (CM-412): every section in their
 * order with whether it shows, for every Project.
 */
export const ConstructionProjectsDashboardLayoutResponseModel = z.object({
  sections: z.array(
    z.object({
      key: z.enum(DASHBOARD_SECTION_KEYS as [string, ...string[]]),
      label: z.string(),
      milestone: z
        .string()
        .nullable()
        .describe(
          "The milestone whose data fills a section that is still a stub; null when it has data.",
        ),
      visible: z.boolean(),
    }),
  ),
});

export type ConstructionProjectsDashboardLayoutResponseModel = z.infer<
  typeof ConstructionProjectsDashboardLayoutResponseModel
>;

export const UpdateConstructionProjectsDashboardLayoutRequestModel = z.object({
  sections: z
    .array(
      z.object({
        key: z
          .string()
          .max(60)
          .describe(
            `A section key: ${DASHBOARD_SECTION_KEYS.join(", ")}. Another is 400 DASHBOARD_SECTION_UNKNOWN; one twice is 400 DASHBOARD_SECTION_DUPLICATE.`,
          ),
        visible: z.boolean(),
      }),
    )
    .max(50)
    .describe(
      "Sections in the order to show them; sections left out follow, shown, in the default order. An empty list resets.",
    ),
});

export type UpdateConstructionProjectsDashboardLayoutRequestModel = z.infer<
  typeof UpdateConstructionProjectsDashboardLayoutRequestModel
>;

export function toDashboardLayoutResponse(
  sections: readonly DashboardSectionSetting[],
): ConstructionProjectsDashboardLayoutResponseModel {
  return {
    sections: sections.map(({ key, visible }) => {
      const section = DASHBOARD_SECTIONS.find((item) => item.key === key);
      return {
        key,
        label: section?.label ?? key,
        milestone: section?.milestone ?? null,
        visible,
      };
    }),
  };
}
