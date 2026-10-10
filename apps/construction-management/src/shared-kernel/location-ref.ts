import { DomainError } from "./domain-error";
import { isUuid } from "./ids";

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
 * The most Floors and Units one LocationRef may name: a Wing holds at most
 * 200 floors and 5,000 units (CM-402), so more can never all be on it.
 */
export const LOCATION_REF_LIMITS = { floorIds: 200, unitIds: 5000 } as const;

/** A LocationRef as it arrives from a request, before `locationRef` checks it. */
export type LocationRefInput = {
  type?: string | null;
  wingId?: string | null;
  floorIds?: readonly string[] | null;
  unitIds?: readonly string[] | null;
  developmentId?: string | null;
  locationId?: string | null;
};

function invalid(
  code: string,
  message: string,
  details: { field: string; ids?: string[] },
): DomainError {
  return new DomainError(code, message, { details });
}

export function isLocationType(value: string): value is LocationType {
  return LOCATION_TYPES.some((item) => item.key === value);
}

/** The id the type needs, trimmed and lower-cased; 400 when missing or not a uuid. */
function requiredId(
  raw: string | null | undefined,
  field: string,
  missing: string,
): string {
  const id = raw?.trim().toLowerCase() ?? "";
  if (id === "") throw invalid("LOCATION_ID_REQUIRED", missing, { field });
  if (!isUuid(id))
    throw invalid("LOCATION_ID_INVALID", "This location is not valid.", {
      field,
      ids: [id],
    });
  return id;
}

/** Ids trimmed, lower-cased and de-duplicated in the order given. */
function idList(
  raw: readonly string[] | null | undefined,
  field: "floorIds" | "unitIds",
  tooMany: { code: string; message: string },
): string[] {
  const ids = [...new Set((raw ?? []).map((id) => id.trim().toLowerCase()))];
  const bad = ids.filter((id) => !isUuid(id));
  if (bad.length > 0)
    throw invalid("LOCATION_ID_INVALID", "This location is not valid.", {
      field,
      ids: bad,
    });
  if (ids.length > LOCATION_REF_LIMITS[field])
    throw invalid(tooMany.code, tooMany.message, { field });
  return ids;
}

/**
 * Cleans and checks the shape of a LocationRef: a known type and the id it
 * needs; for a Wing, Floor and Unit ids as uuids, de-duplicated, within
 * `LOCATION_REF_LIMITS`. Fields of other types are dropped. Throws 400
 * DomainErrors with `details.field`. Whether the ids are the Project's is
 * the `LocationResolver`'s check.
 */
export function locationRef(input: LocationRefInput): LocationRef {
  const type = input.type?.trim() ?? "";
  if (type === "")
    throw invalid("LOCATION_TYPE_REQUIRED", "Choose a Location Type.", {
      field: "type",
    });
  if (!isLocationType(type))
    throw invalid("LOCATION_TYPE_INVALID", "This Location Type is not known.", {
      field: "type",
    });
  switch (type) {
    case "wing":
      return {
        type,
        wingId: requiredId(input.wingId, "wingId", "Choose a Wing."),
        floorIds: idList(input.floorIds, "floorIds", {
          code: "LOCATION_TOO_MANY_FLOORS",
          message: `Choose at most ${String(LOCATION_REF_LIMITS.floorIds)} Floors.`,
        }),
        unitIds: idList(input.unitIds, "unitIds", {
          code: "LOCATION_TOO_MANY_UNITS",
          message: "Choose at most 5,000 Units.",
        }),
      };
    case "amenity":
      return {
        type,
        developmentId: requiredId(
          input.developmentId,
          "developmentId",
          "Choose an Amenity.",
        ),
      };
    case "common_development":
      return {
        type,
        developmentId: requiredId(
          input.developmentId,
          "developmentId",
          "Choose a Common Development.",
        ),
      };
    case "location":
      return {
        type,
        locationId: requiredId(
          input.locationId,
          "locationId",
          "Choose a Location.",
        ),
      };
  }
}

/** The names a LocationRef points at, for its one-line label. */
export type LocationNames =
  | {
      type: "wing";
      wing: string;
      floors: readonly string[];
      units: readonly string[];
    }
  | {
      type: "amenity" | "common_development" | "location";
      name: string;
    };

/** Names listed in a label before "+N more". */
const LABEL_NAMES = 3;

function listed(names: readonly string[]): string {
  const shown = names.slice(0, LABEL_NAMES).join(", ");
  const more = names.length - LABEL_NAMES;
  return more > 0 ? `${shown} +${String(more)} more` : shown;
}

const SINGULAR: Record<Exclude<LocationType, "wing">, string> = {
  amenity: "Amenity",
  common_development: "Common Development",
  location: "Location",
};

/**
 * One line for a LocationRef: "Wing A · Ground Floor, Floor 1 · Units
 * G01, 101", "Amenity · Swimming Pool", "Location · Culvert C3". Floor
 * names are shown as they are (they already say "Floor"); at most three
 * Floors or Units are named, then "+N more".
 */
export function locationLabel(names: LocationNames): string {
  if (names.type !== "wing") return `${SINGULAR[names.type]} · ${names.name}`;
  const parts = [names.wing];
  if (names.floors.length > 0) parts.push(listed(names.floors));
  if (names.units.length > 0)
    parts.push(
      `${names.units.length === 1 ? "Unit" : "Units"} ${listed(names.units)}`,
    );
  return parts.join(" · ");
}

/**
 * Checks a LocationRef against a Project: every id exists, is live and is
 * the Project's (floors on the wing, units on those floors, the amenity
 * assigned to it). Throws a 400 DomainError naming the problem — 400 like
 * every unknown-id check in the app, not 422.
 */
export type LocationResolver = {
  assertOnProject(
    workspaceId: string,
    projectId: string,
    ref: LocationRef,
  ): Promise<void>;
};
