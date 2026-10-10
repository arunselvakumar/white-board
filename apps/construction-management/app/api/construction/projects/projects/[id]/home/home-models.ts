import { z } from "zod";

import type { ProjectHomeReadModel } from "@/src/projects/application/project-home-handlers";
import { PROJECT_MODULE_KEYS } from "@/src/projects/domain/project-modules";

export const projectModuleKeyModel = z
  .string()
  .max(60)
  .describe(
    `A Project module key: ${PROJECT_MODULE_KEYS.join(", ")}. Another value is 400 PROJECT_MODULE_UNKNOWN.`,
  );

/**
 * The modules a member sees on a Project's home (CM-411), in their tile
 * order, with the Project's pin and whether they may hide modules.
 */
export const ConstructionProjectsProjectHomeResponseModel = z.object({
  modules: z.array(
    z.object({
      key: z.enum(PROJECT_MODULE_KEYS as [string, ...string[]]),
      label: z.string(),
      description: z.string().describe("One line for the home tile."),
      segment: z
        .string()
        .describe("The page under `/app/projects/{id}/`; empty never."),
      hidden: z
        .boolean()
        .describe(
          "Hidden on this Project. Hidden modules are only listed for members who may unhide them (`canHideModules`).",
        ),
    }),
  ),
  pinned: z.boolean().describe("The caller pinned this Project."),
  canHideModules: z
    .boolean()
    .describe("The caller has the Project menu's Update flag on it."),
});

export type ConstructionProjectsProjectHomeResponseModel = z.infer<
  typeof ConstructionProjectsProjectHomeResponseModel
>;

export const UpdateConstructionProjectsHiddenModulesRequestModel = z.object({
  hiddenModules: z
    .array(projectModuleKeyModel)
    .max(100)
    .describe(
      "Every module hidden on this Project, for everyone on it; the rest show.",
    ),
});

export type UpdateConstructionProjectsHiddenModulesRequestModel = z.infer<
  typeof UpdateConstructionProjectsHiddenModulesRequestModel
>;

export const ConstructionProjectsPinResponseModel = z.object({
  pinned: z.boolean(),
});

export function toProjectHomeResponse(
  home: ProjectHomeReadModel,
): ConstructionProjectsProjectHomeResponseModel {
  return {
    modules: home.modules.map((module) => ({ ...module })),
    pinned: home.pinned,
    canHideModules: home.canHideModules,
  };
}
