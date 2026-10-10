/**
 * Where on a Project a site entry happened (ADR CM-0013 §7): a Wing with
 * any of its Floors and Units, an assigned Amenity or Common Development,
 * or a Location of a non-building Project. Ids are opaque: the
 * `LocationResolver` the composition root builds from the projects and
 * masters contexts checks they belong to the entry's Project.
 */
export type LocationRef =
  | {
      type: "wing";
      wingId: string;
      floorIds: readonly string[];
      unitIds: readonly string[];
    }
  | { type: "amenity"; developmentId: string }
  | { type: "common_development"; developmentId: string }
  | { type: "location"; locationId: string };

export type LocationType = LocationRef["type"];

export const LOCATION_TYPES = [
  { key: "wing", label: "Wing" },
  { key: "amenity", label: "Amenities" },
  { key: "common_development", label: "Common Developments" },
  { key: "location", label: "Location" },
] as const satisfies readonly { key: LocationType; label: string }[];

/**
 * Checks a LocationRef against a Project: every id exists, is live and is
 * the Project's (floors on the wing, units on those floors, the amenity
 * assigned to it). Throws a 422 DomainError naming the first problem.
 */
export type LocationResolver = {
  assertOnProject(
    workspaceId: string,
    projectId: string,
    ref: LocationRef,
  ): Promise<void>;
};
