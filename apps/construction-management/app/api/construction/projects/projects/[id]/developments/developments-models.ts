import { z } from "zod";

import type { ProjectDevelopmentsReadModel } from "@/src/masters/application/development-handlers";

const item = z.object({
  id: z.uuid(),
  name: z.string(),
  disabled: z
    .boolean()
    .describe(
      "Disabled in Masters: stays on the Project but cannot be added again once removed.",
    ),
});

function kindModel(label: string) {
  return z.object({
    assigned: z
      .array(item)
      .describe(
        `The Project's live ${label}, disabled ones included, by name: what its site entries can be located at.`,
      ),
    choices: z
      .array(item)
      .describe(
        `The Company's live, enabled ${label}, by name: what can be added.`,
      ),
  });
}

/**
 * A Project's Amenities and Common Developments (CM-404). The rows are the
 * masters context's; the Project is checked by the projects context.
 */
export const ConstructionProjectsProjectDevelopmentsResponseModel = z.object({
  amenities: kindModel("Amenities"),
  commonDevelopments: kindModel("Common Developments"),
});

export type ConstructionProjectsProjectDevelopmentsResponseModel = z.infer<
  typeof ConstructionProjectsProjectDevelopmentsResponseModel
>;

const ids = (label: string, code: string) =>
  z
    .array(z.uuid())
    .max(500)
    .optional()
    .describe(
      `Every ${label} the Project should have; left out keeps them. 400 ${code}_NOT_FOUND (with \`details.ids\`) for an id that is not a live ${label} of the Company, ${code}_DISABLED for a disabled one the Project does not have yet.`,
    );

export const UpdateConstructionProjectsProjectDevelopmentsRequestModel =
  z.object({
    amenityIds: ids("Amenity", "AMENITY"),
    commonDevelopmentIds: ids("Common Development", "COMMON_DEVELOPMENT"),
  });

export type UpdateConstructionProjectsProjectDevelopmentsRequestModel = z.infer<
  typeof UpdateConstructionProjectsProjectDevelopmentsRequestModel
>;

export function toProjectDevelopmentsResponse(
  model: ProjectDevelopmentsReadModel,
): ConstructionProjectsProjectDevelopmentsResponseModel {
  return {
    amenities: model.amenity,
    commonDevelopments: model.common_development,
  };
}
