import { z } from "zod";

import type { LocationView } from "@/src/projects/application/structure-read-model";
import {
  LOCATION_DESCRIPTION_MAX,
  LOCATION_NAME_MAX,
} from "@/src/projects/domain/location";

export const ConstructionProjectsLocationParamsModel = z.object({
  id: z.uuid(),
  locationId: z.uuid(),
});

export const ConstructionProjectsLocationResponseModel = z.object({
  id: z.uuid(),
  name: z.string(),
  description: z.string().nullable(),
  position: z.int().describe("Order on the Locations screen and in pickers."),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso
    .datetime()
    .describe("Send it back as `expectedUpdatedAt` when you edit."),
});

export type ConstructionProjectsLocationResponseModel = z.infer<
  typeof ConstructionProjectsLocationResponseModel
>;

/**
 * A Project's Locations in order. A Project names a handful, so the list
 * is not paged.
 */
export const ListConstructionProjectsLocationsResponseModel = z.object({
  items: z.array(ConstructionProjectsLocationResponseModel),
});

export type ListConstructionProjectsLocationsResponseModel = z.infer<
  typeof ListConstructionProjectsLocationsResponseModel
>;

const locationFields = {
  name: z
    .string()
    .describe(
      `Required; at most ${String(LOCATION_NAME_MAX)} characters, unique on the Project ignoring case. 400 LOCATION_NAME_REQUIRED, LOCATION_NAME_TOO_LONG; 409 LOCATION_NAME_IN_USE.`,
    ),
  description: z
    .string()
    .nullable()
    .optional()
    .describe(
      `At most ${String(LOCATION_DESCRIPTION_MAX)} characters; blank or null for none. 400 LOCATION_DESCRIPTION_TOO_LONG.`,
    ),
};

export const CreateConstructionProjectsLocationRequestModel =
  z.object(locationFields);

export type CreateConstructionProjectsLocationRequestModel = z.infer<
  typeof CreateConstructionProjectsLocationRequestModel
>;

export const UpdateConstructionProjectsLocationRequestModel = z.object({
  ...locationFields,
  expectedUpdatedAt: z.iso
    .datetime()
    .describe(
      "The `updatedAt` you loaded. A mismatch is 409 LOCATION_CHANGED.",
    ),
});

export type UpdateConstructionProjectsLocationRequestModel = z.infer<
  typeof UpdateConstructionProjectsLocationRequestModel
>;

export const MoveConstructionProjectsLocationRequestModel = z.object({
  direction: z
    .enum(["up", "down"])
    .describe(
      "Swap places with the Location above or below; at the top or bottom nothing changes.",
    ),
});

export type MoveConstructionProjectsLocationRequestModel = z.infer<
  typeof MoveConstructionProjectsLocationRequestModel
>;

export function toLocationResponse(
  location: LocationView,
): ConstructionProjectsLocationResponseModel {
  return {
    id: location.id,
    name: location.name,
    description: location.description,
    position: location.position,
    createdAt: location.createdAt.toISOString(),
    updatedAt: location.updatedAt.toISOString(),
  };
}
