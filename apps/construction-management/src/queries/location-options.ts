import { queryOptions } from "@tanstack/react-query";

import type { ConstructionProjectsLocationOptionsResponseModel } from "@/app/api/construction/projects/projects/[id]/location-options/location-options-models";
import type {
  LocationNames,
  LocationRef,
} from "@/src/shared-kernel/location-ref";

import { apiJson } from "./http";
import { PROJECTS_API, PROJECTS_KEY } from "./projects";

/** What the location picker offers on a Project (CM-403). */
export type LocationOptions = ConstructionProjectsLocationOptionsResponseModel;
export type LocationOptionWing = LocationOptions["wings"][number];
export type LocationOptionFloor = LocationOptionWing["floors"][number];

export function locationOptionsKey(projectId: string) {
  return [...PROJECTS_KEY, "location-options", projectId] as const;
}

/**
 * The picker's tree. Always stale, so a form opened after someone added a
 * Wing, a Location or an Amenity refetches in the background.
 */
export function locationOptionsQuery(projectId: string) {
  return queryOptions({
    queryKey: locationOptionsKey(projectId),
    queryFn: () =>
      apiJson<LocationOptions>(
        `${PROJECTS_API}/${encodeURIComponent(projectId)}/location-options`,
      ),
    staleTime: 0,
  });
}

/**
 * The names a LocationRef points at, from the picker's options; null when
 * its Wing, Amenity, Common Development or Location is not offered (any
 * more). Floors and Units that are gone are left out.
 */
export function locationNames(
  options: LocationOptions,
  ref: LocationRef,
): LocationNames | null {
  const named = (rows: { id: string; name: string }[], id: string) =>
    rows.find((row) => row.id === id)?.name;
  let name: string | undefined;
  switch (ref.type) {
    case "wing": {
      const wing = options.wings.find((item) => item.id === ref.wingId);
      if (wing == null) return null;
      const units = wing.floors.flatMap((floor) => floor.units);
      return {
        type: "wing",
        wing: wing.name,
        floors: ref.floorIds.flatMap((id) => named(wing.floors, id) ?? []),
        units: ref.unitIds.flatMap((id) => named(units, id) ?? []),
      };
    }
    case "amenity":
      name = named(options.amenities, ref.developmentId);
      break;
    case "common_development":
      name = named(options.commonDevelopments, ref.developmentId);
      break;
    case "location":
      name = named(options.locations, ref.locationId);
      break;
  }
  return name == null ? null : { type: ref.type, name };
}
