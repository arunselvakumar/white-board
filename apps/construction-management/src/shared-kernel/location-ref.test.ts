import { describe, expect, it } from "vitest";

import { DomainError } from "./domain-error";
import { newId } from "./ids";
import {
  LOCATION_REF_LIMITS,
  locationLabel,
  locationRef,
  type LocationRefInput,
} from "./location-ref";

function failure(input: LocationRefInput): DomainError {
  try {
    locationRef(input);
  } catch (error) {
    if (error instanceof DomainError) return error;
    throw error;
  }
  throw new Error("Expected a DomainError");
}

const ids = (count: number) => Array.from({ length: count }, () => newId());

describe("locationRef", () => {
  it("cleans a Wing ref: ids trimmed, lower-cased and de-duplicated in order", () => {
    const [wing = "", floor = "", unit = "", other = ""] = ids(4);
    expect(
      locationRef({
        type: " wing ",
        wingId: ` ${wing.toUpperCase()} `,
        floorIds: [floor, ` ${floor.toUpperCase()}`],
        unitIds: [other, unit, other],
        developmentId: newId(),
      }),
    ).toEqual({
      type: "wing",
      wingId: wing,
      floorIds: [floor],
      unitIds: [other, unit],
    });
  });

  it("lets a Wing ref leave out Floors and Units", () => {
    const wing = newId();
    expect(locationRef({ type: "wing", wingId: wing, floorIds: null })).toEqual(
      { type: "wing", wingId: wing, floorIds: [], unitIds: [] },
    );
  });

  it("keeps only the id each other type needs", () => {
    const id = newId();
    expect(
      locationRef({ type: "amenity", developmentId: id, wingId: newId() }),
    ).toEqual({ type: "amenity", developmentId: id });
    expect(
      locationRef({ type: "common_development", developmentId: id }),
    ).toEqual({ type: "common_development", developmentId: id });
    expect(
      locationRef({ type: "location", locationId: id, unitIds: [newId()] }),
    ).toEqual({ type: "location", locationId: id });
  });

  it("needs a known Location Type", () => {
    for (const type of [undefined, null, "", "  "])
      expect(failure({ type })).toMatchObject({
        code: "LOCATION_TYPE_REQUIRED",
        kind: "invalid",
        details: { field: "type" },
      });
    expect(failure({ type: "unit" })).toMatchObject({
      code: "LOCATION_TYPE_INVALID",
      details: { field: "type" },
    });
  });

  it("needs the id of its type", () => {
    expect(failure({ type: "wing", floorIds: [newId()] })).toMatchObject({
      code: "LOCATION_ID_REQUIRED",
      message: "Choose a Wing.",
      details: { field: "wingId" },
    });
    expect(failure({ type: "amenity", locationId: newId() })).toMatchObject({
      code: "LOCATION_ID_REQUIRED",
      message: "Choose an Amenity.",
      details: { field: "developmentId" },
    });
    expect(failure({ type: "common_development" })).toMatchObject({
      message: "Choose a Common Development.",
      details: { field: "developmentId" },
    });
    expect(failure({ type: "location", locationId: " " })).toMatchObject({
      code: "LOCATION_ID_REQUIRED",
      message: "Choose a Location.",
      details: { field: "locationId" },
    });
  });

  it("refuses ids that are not uuids, naming them", () => {
    expect(failure({ type: "location", locationId: "culvert" })).toMatchObject({
      code: "LOCATION_ID_INVALID",
      details: { field: "locationId", ids: ["culvert"] },
    });
    expect(
      failure({ type: "wing", wingId: newId(), unitIds: [newId(), "101"] }),
    ).toMatchObject({
      code: "LOCATION_ID_INVALID",
      details: { field: "unitIds", ids: ["101"] },
    });
  });

  it("caps Floors and Units at what one Wing can hold", () => {
    const wingId = newId();
    expect(
      locationRef({
        type: "wing",
        wingId,
        floorIds: ids(LOCATION_REF_LIMITS.floorIds),
      }).type,
    ).toBe("wing");
    expect(
      failure({
        type: "wing",
        wingId,
        floorIds: ids(LOCATION_REF_LIMITS.floorIds + 1),
      }),
    ).toMatchObject({
      code: "LOCATION_TOO_MANY_FLOORS",
      details: { field: "floorIds" },
    });
    expect(
      failure({
        type: "wing",
        wingId,
        unitIds: ids(LOCATION_REF_LIMITS.unitIds + 1),
      }),
    ).toMatchObject({
      code: "LOCATION_TOO_MANY_UNITS",
      details: { field: "unitIds" },
    });
  });
});

describe("locationLabel", () => {
  it("names a Wing with its Floors and Units", () => {
    expect(
      locationLabel({
        type: "wing",
        wing: "Wing A",
        floors: ["Ground Floor", "Floor 1"],
        units: ["G01", "101"],
      }),
    ).toBe("Wing A · Ground Floor, Floor 1 · Units G01, 101");
    expect(
      locationLabel({
        type: "wing",
        wing: "Wing A",
        floors: [],
        units: ["101"],
      }),
    ).toBe("Wing A · Unit 101");
    expect(
      locationLabel({ type: "wing", wing: "Wing B", floors: [], units: [] }),
    ).toBe("Wing B");
  });

  it("names at most three Floors or Units, then how many more", () => {
    expect(
      locationLabel({
        type: "wing",
        wing: "Wing A",
        floors: ["Floor 1", "Floor 2", "Floor 3", "Floor 4"],
        units: ["101", "102", "103", "104", "105"],
      }),
    ).toBe(
      "Wing A · Floor 1, Floor 2, Floor 3 +1 more · Units 101, 102, 103 +2 more",
    );
  });

  it("names the other types after their type", () => {
    expect(locationLabel({ type: "amenity", name: "Swimming Pool" })).toBe(
      "Amenity · Swimming Pool",
    );
    expect(
      locationLabel({ type: "common_development", name: "Compound Wall" }),
    ).toBe("Common Development · Compound Wall");
    expect(locationLabel({ type: "location", name: "Culvert C3" })).toBe(
      "Location · Culvert C3",
    );
  });
});
