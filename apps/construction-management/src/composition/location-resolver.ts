import { prisma, type PrismaClient } from "@repo/construction-db";

import type { DevelopmentKind } from "@/src/masters/domain/master-kind";
import { createProjectDevelopmentHandlers } from "@/src/masters/infrastructure/create-masters-handlers";
import type { WingTree } from "@/src/projects/application/structure-read-model";
import type { FloorKind } from "@/src/projects/domain/wing-generator";
import { createProjectStructureReader } from "@/src/projects/infrastructure/create-project-structure";
import { DomainError } from "@/src/shared-kernel/domain-error";
import {
  LOCATION_TYPES,
  type LocationRef,
  type LocationResolver,
  type LocationType,
} from "@/src/shared-kernel/location-ref";

/** An Amenity or Common Development the Project has. */
export type AssignedDevelopment = {
  id: string;
  name: string;
  /** Disabled in Masters: kept on the Project, not offered by the picker. */
  disabled: boolean;
};

/**
 * What the resolver and the picker read, by Company and Project id with no
 * visibility check: Wings and Locations from the projects context, the
 * assigned Amenities and Common Developments from the masters context.
 */
export type LocationSources = {
  wings(workspaceId: string, projectId: string): Promise<WingTree[]>;
  wing(
    workspaceId: string,
    projectId: string,
    wingId: string,
  ): Promise<WingTree | null>;
  locations(
    workspaceId: string,
    projectId: string,
  ): Promise<{ id: string; name: string }[]>;
  developments(
    workspaceId: string,
    projectId: string,
  ): Promise<Record<DevelopmentKind, AssignedDevelopment[]>>;
};

type Named = { id: string; name: string };

/** The tree the location picker needs (CM-403). */
export type LocationOptions = {
  /** Only the types the Project has rows for, in `LOCATION_TYPES` order. */
  types: LocationType[];
  /** Live Wings in Phase then Wing order; Floors top to bottom. */
  wings: (Named & {
    phaseName: string;
    floors: (Named & { kind: FloorKind; units: Named[] })[];
  })[];
  /** Assigned and enabled, by name. */
  amenities: Named[];
  commonDevelopments: Named[];
  /** In the Team Member's order. */
  locations: Named[];
};

function notOnProject(
  code: string,
  message: string,
  details: { field: string; ids?: string[] },
): DomainError {
  return new DomainError(code, message, { details });
}

const named = ({ id, name }: Named): Named => ({ id, name });

/**
 * Where the projects and masters contexts meet for a LocationRef (ADR
 * CM-0013 §7): the `LocationResolver` site-entry contexts call before they
 * store one, and the options the picker offers. Neither context imports
 * the other; this module reads both. Callers check the Project is visible.
 */
export class ProjectLocations implements LocationResolver {
  constructor(private readonly sources: LocationSources) {}

  /**
   * Every id is live and the Project's: the Wing, each Floor on that Wing,
   * each Unit on the chosen Floors (on the Wing when none are chosen); an
   * Amenity or Common Development assigned to the Project (a disabled one
   * still counts, so an entry made before it was disabled can be saved
   * again); a Location of the Project. 400 otherwise, with
   * `details.field` and the offending `details.ids`.
   */
  async assertOnProject(
    workspaceId: string,
    projectId: string,
    ref: LocationRef,
  ): Promise<void> {
    switch (ref.type) {
      case "wing":
        return this.assertWing(workspaceId, projectId, ref);
      case "amenity":
      case "common_development": {
        const assigned = await this.sources.developments(
          workspaceId,
          projectId,
        );
        if (assigned[ref.type].some((row) => row.id === ref.developmentId))
          return;
        throw ref.type === "amenity"
          ? notOnProject(
              "LOCATION_AMENITY_NOT_ASSIGNED",
              "This Amenity is not assigned to the Project.",
              { field: "developmentId", ids: [ref.developmentId] },
            )
          : notOnProject(
              "LOCATION_COMMON_DEVELOPMENT_NOT_ASSIGNED",
              "This Common Development is not assigned to the Project.",
              { field: "developmentId", ids: [ref.developmentId] },
            );
      }
      case "location": {
        const locations = await this.sources.locations(workspaceId, projectId);
        if (locations.some((row) => row.id === ref.locationId)) return;
        throw notOnProject(
          "LOCATION_NOT_ON_PROJECT",
          "This Location is not on the Project.",
          { field: "locationId", ids: [ref.locationId] },
        );
      }
    }
  }

  private async assertWing(
    workspaceId: string,
    projectId: string,
    ref: Extract<LocationRef, { type: "wing" }>,
  ): Promise<void> {
    const wing = await this.sources.wing(workspaceId, projectId, ref.wingId);
    if (wing == null)
      throw notOnProject(
        "LOCATION_WING_NOT_FOUND",
        "This Wing is not on the Project.",
        { field: "wingId", ids: [ref.wingId] },
      );
    const floors = new Map(wing.floors.map((floor) => [floor.id, floor]));
    const strayFloors = ref.floorIds.filter((id) => !floors.has(id));
    if (strayFloors.length > 0)
      throw notOnProject(
        "LOCATION_FLOOR_NOT_ON_WING",
        "Some Floors are not on this Wing. Choose them again.",
        { field: "floorIds", ids: strayFloors },
      );
    if (ref.unitIds.length === 0) return;
    const onWing = new Set(
      wing.floors.flatMap((floor) => floor.units.map((unit) => unit.id)),
    );
    const strayUnits = ref.unitIds.filter((id) => !onWing.has(id));
    if (strayUnits.length > 0)
      throw notOnProject(
        "LOCATION_UNIT_NOT_ON_WING",
        "Some Units are not on this Wing. Choose them again.",
        { field: "unitIds", ids: strayUnits },
      );
    if (ref.floorIds.length === 0) return;
    const onFloors = new Set(
      ref.floorIds.flatMap(
        (id) => floors.get(id)?.units.map((unit) => unit.id) ?? [],
      ),
    );
    const elsewhere = ref.unitIds.filter((id) => !onFloors.has(id));
    if (elsewhere.length > 0)
      throw notOnProject(
        "LOCATION_UNIT_NOT_ON_FLOORS",
        "Some Units are not on the chosen Floors.",
        { field: "unitIds", ids: elsewhere },
      );
  }

  /**
   * What the picker offers on this Project: its live Wings with Floors and
   * Units, its enabled Amenities and Common Developments, its Locations,
   * and the types that have any of them.
   */
  async options(
    workspaceId: string,
    projectId: string,
  ): Promise<LocationOptions> {
    const [wings, locations, developments] = await Promise.all([
      this.sources.wings(workspaceId, projectId),
      this.sources.locations(workspaceId, projectId),
      this.sources.developments(workspaceId, projectId),
    ]);
    const enabled = (rows: AssignedDevelopment[]) =>
      rows.filter((row) => !row.disabled).map(named);
    const options: Omit<LocationOptions, "types"> = {
      wings: wings.map((wing) => ({
        id: wing.id,
        name: wing.name,
        phaseName: wing.phaseName,
        floors: wing.floors.map((floor) => ({
          id: floor.id,
          name: floor.name,
          kind: floor.kind,
          units: floor.units.map(named),
        })),
      })),
      amenities: enabled(developments.amenity),
      commonDevelopments: enabled(developments.common_development),
      locations: locations.map(named),
    };
    const count: Record<LocationType, number> = {
      wing: options.wings.length,
      amenity: options.amenities.length,
      common_development: options.commonDevelopments.length,
      location: options.locations.length,
    };
    return {
      types: LOCATION_TYPES.map((item) => item.key).filter(
        (type) => count[type] > 0,
      ),
      ...options,
    };
  }
}

/** The Prisma-backed composition the routes and site-entry contexts use. */
export function createProjectLocations(deps?: {
  prisma?: PrismaClient;
}): ProjectLocations {
  const db = deps?.prisma ?? prisma;
  const structure = createProjectStructureReader({ prisma: db });
  const developments = createProjectDevelopmentHandlers({ prisma: db });
  return new ProjectLocations({
    wings: (workspaceId, projectId) => structure.wings(workspaceId, projectId),
    wing: (workspaceId, projectId, wingId) =>
      structure.wing(workspaceId, projectId, wingId),
    locations: (workspaceId, projectId) =>
      structure.locations(workspaceId, projectId),
    developments: (workspaceId, projectId) =>
      developments.assigned(workspaceId, projectId),
  });
}
