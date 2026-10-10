import { z } from "zod";

import type { LocationOptions } from "@/src/composition/location-resolver";
import { FLOOR_KINDS } from "@/src/projects/domain/wing-generator";
import type { ProjectStructure } from "@/src/projects/domain/project-type";
import { LOCATION_TYPES } from "@/src/shared-kernel/location-ref";

import { projectStructureModel } from "../../project-models";

const LOCATION_TYPE_KEYS = LOCATION_TYPES.map((item) => item.key);

const named = z.object({ id: z.uuid(), name: z.string() });

/**
 * What the location picker offers on a Project (CM-403): the Location
 * Types it has rows for, its live Wings with Floors and Units, its
 * enabled Amenities and Common Developments, and its Locations.
 */
export const ConstructionProjectsLocationOptionsResponseModel = z.object({
  structure: projectStructureModel.describe(
    "From the Project Type: where to send someone when the Project has no rows yet (the Wings or the Locations page).",
  ),
  types: z
    .array(z.enum(LOCATION_TYPE_KEYS as [string, ...string[]]))
    .describe(
      `Only the Location Types the Project has rows for, in this order: ${LOCATION_TYPE_KEYS.join(", ")}. Empty for a Project with nothing to locate an entry at.`,
    ),
  wings: z
    .array(
      named.extend({
        phaseName: z.string(),
        floors: z
          .array(
            named.extend({
              kind: z.enum(FLOOR_KINDS),
              units: z.array(named).describe("Live Units in order."),
            }),
          )
          .describe("Live Floors, top to bottom."),
      }),
    )
    .describe("Live Wings in Phase order, then Wing order."),
  amenities: z
    .array(named)
    .describe(
      "Amenities assigned to the Project and enabled in Masters, by name.",
    ),
  commonDevelopments: z
    .array(named)
    .describe(
      "Common Developments assigned to the Project and enabled in Masters, by name.",
    ),
  locations: z
    .array(named)
    .describe("The Project's Locations in the Team Member's order."),
});

export type ConstructionProjectsLocationOptionsResponseModel = z.infer<
  typeof ConstructionProjectsLocationOptionsResponseModel
>;

export function toLocationOptionsResponse(
  structure: ProjectStructure,
  options: LocationOptions,
): ConstructionProjectsLocationOptionsResponseModel {
  return { structure, ...options };
}
