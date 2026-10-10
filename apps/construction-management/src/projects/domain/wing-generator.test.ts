import { describe, expect, it } from "vitest";

import { DomainError } from "@/src/shared-kernel/domain-error";

import {
  WING_TYPES,
  defaultWingConfigInput,
  generateWingFloors,
  suggestUnitName,
  wingConfig,
  wingTotals,
  type GeneratedFloor,
  type WingConfigInput,
  type WingType,
} from "./wing-generator";

function generate(type: WingType, input: WingConfigInput): GeneratedFloor[] {
  return generateWingFloors(type, wingConfig(type, input));
}

/** `Name: unit, unit` per floor, top to bottom: the golden picture. */
function picture(floors: GeneratedFloor[]): string[] {
  return floors.map(
    (floor) => `${floor.kind} ${floor.name}: ${floor.units.join(" ") || "-"}`,
  );
}

function codeOf(run: () => unknown): { code: string; details: unknown } {
  try {
    run();
  } catch (error) {
    if (error instanceof DomainError)
      return { code: error.code, details: error.details };
    throw error;
  }
  throw new Error("Expected a DomainError");
}

describe("Wing generator (ADR CM-0013 §3)", () => {
  it("lists the eight Wing Types in the legacy order", () => {
    expect(WING_TYPES.map((type) => type.label)).toEqual([
      "Commercial",
      "Residential",
      "Bungalow scheme",
      "Residential & Commercial",
      "Plotting scheme",
      "Institutional",
      "Individual Unit",
      "Industrial",
    ]);
  });

  it("Commercial: terrace, typed floors high to low, ground, basements (the legacy example)", () => {
    const floors = generate("commercial", {
      floors: 5,
      startNumber: 1,
      unitsPerFloor: 4,
      basements: 2,
    });
    expect(picture(floors)).toEqual([
      "terrace Terrace Floor: -",
      "typed Commercial Floor 5: 501 502 503 504",
      "typed Commercial Floor 4: 401 402 403 404",
      "typed Commercial Floor 3: 301 302 303 304",
      "typed Commercial Floor 2: 201 202 203 204",
      "typed Commercial Floor 1: 101 102 103 104",
      "ground Ground Floor: G01 G02 G03 G04",
      "basement Basement Floor 2: -",
      "basement Basement Floor 1: -",
    ]);
    expect(wingTotals(floors)).toEqual({ floors: 9, units: 24 });
  });

  it("Residential: numbers from the start number, terrace can be turned off", () => {
    const floors = generate("residential", {
      floors: 3,
      startNumber: 11,
      unitsPerFloor: 2,
      terrace: false,
    });
    expect(picture(floors)).toEqual([
      "typed Residential Floor 13: 1301 1302",
      "typed Residential Floor 12: 1201 1202",
      "typed Residential Floor 11: 1101 1102",
      "ground Ground Floor: G01 G02",
    ]);
  });

  it("Institutional and Industrial name their floors after the type", () => {
    expect(
      picture(
        generate("institutional", {
          floors: 1,
          startNumber: 1,
          unitsPerFloor: 1,
        }),
      ),
    ).toEqual([
      "terrace Terrace Floor: -",
      "typed Institutional Floor 1: 101",
      "ground Ground Floor: G01",
    ]);
    expect(
      picture(
        generate("industrial", {
          floors: 2,
          startNumber: 1,
          unitsPerFloor: 3,
          basements: 1,
        }),
      ),
    ).toEqual([
      "terrace Terrace Floor: -",
      "typed Industrial Floor 2: 201 202 203",
      "typed Industrial Floor 1: 101 102 103",
      "ground Ground Floor: G01 G02 G03",
      "basement Basement Floor 1: -",
    ]);
  });

  it("Individual Unit defaults to one unit per floor", () => {
    expect(defaultWingConfigInput("individual_unit").unitsPerFloor).toBe(1);
    expect(defaultWingConfigInput("commercial").unitsPerFloor).toBeNull();
    const floors = generate("individual_unit", {
      ...defaultWingConfigInput("individual_unit"),
      floors: 2,
    });
    expect(picture(floors)).toEqual([
      "terrace Terrace Floor: -",
      "typed Floor 2: 201",
      "typed Floor 1: 101",
      "ground Ground Floor: G01",
    ]);
  });

  it("a typed floor 12 gives 1201; zero typed floors leave Ground", () => {
    expect(
      generate("residential", {
        floors: 1,
        startNumber: 12,
        unitsPerFloor: 1,
      })[1]?.units,
    ).toEqual(["1201"]);
    expect(
      picture(
        generate("commercial", { floors: 0, startNumber: 1, unitsPerFloor: 2 }),
      ),
    ).toEqual(["terrace Terrace Floor: -", "ground Ground Floor: G01 G02"]);
  });

  it("Residential & Commercial: commercial floors above Ground, residential above them numbered on", () => {
    const floors = generate("residential_and_commercial", {
      commercialFloors: 2,
      commercialUnitsPerFloor: 3,
      residentialFloors: 3,
      residentialUnitsPerFloor: 2,
      startNumber: 1,
      basements: 1,
    });
    expect(picture(floors)).toEqual([
      "terrace Terrace Floor: -",
      "typed Residential Floor 5: 501 502",
      "typed Residential Floor 4: 401 402",
      "typed Residential Floor 3: 301 302",
      "typed Commercial Floor 2: 201 202 203",
      "typed Commercial Floor 1: 101 102 103",
      "ground Ground Floor: G01 G02 G03",
      "basement Basement Floor 1: -",
    ]);
    expect(wingTotals(floors)).toEqual({ floors: 8, units: 15 });
  });

  it("Plotting and Bungalow schemes are one site row numbered from the start number", () => {
    expect(
      picture(generate("plotting_scheme", { units: 4, startNumber: 1 })),
    ).toEqual(["site Plots: Plot 1 Plot 2 Plot 3 Plot 4"]);
    expect(
      picture(generate("bungalow_scheme", { units: 3, startNumber: 10 })),
    ).toEqual(["site Bungalows: Bungalow 10 Bungalow 11 Bungalow 12"]);
    // The start number defaults to 1.
    expect(generate("plotting_scheme", { units: 1 })[0]?.units).toEqual([
      "Plot 1",
    ]);
  });

  it("keeps only the Wing Type's fields in the stored configuration", () => {
    expect(
      wingConfig("plotting_scheme", { units: 5, floors: 3, unitsPerFloor: 2 }),
    ).toEqual({ units: 5, startNumber: 1 });
    expect(
      wingConfig("commercial", { floors: 2, startNumber: 1, unitsPerFloor: 2 }),
    ).toEqual({
      floors: 2,
      startNumber: 1,
      unitsPerFloor: 2,
      basements: 0,
      terrace: true,
    });
  });

  it("checks the bounds and names the field", () => {
    const base = { floors: 2, startNumber: 1, unitsPerFloor: 2 };
    expect(
      codeOf(() => wingConfig("commercial", { ...base, floors: 151 })),
    ).toEqual({ code: "WING_FLOORS_INVALID", details: { field: "floors" } });
    expect(
      codeOf(() => wingConfig("commercial", { ...base, floors: null })),
    ).toEqual({ code: "WING_FLOORS_INVALID", details: { field: "floors" } });
    expect(
      codeOf(() => wingConfig("commercial", { ...base, floors: 1.5 })).code,
    ).toBe("WING_FLOORS_INVALID");
    expect(
      codeOf(() => wingConfig("commercial", { ...base, startNumber: 1000 })),
    ).toEqual({
      code: "WING_START_NUMBER_INVALID",
      details: { field: "startNumber" },
    });
    expect(
      codeOf(() => wingConfig("commercial", { ...base, unitsPerFloor: 0 })),
    ).toEqual({
      code: "WING_UNITS_PER_FLOOR_INVALID",
      details: { field: "unitsPerFloor" },
    });
    expect(
      codeOf(() => wingConfig("commercial", { ...base, unitsPerFloor: 51 }))
        .code,
    ).toBe("WING_UNITS_PER_FLOOR_INVALID");
    expect(
      codeOf(() => wingConfig("commercial", { ...base, basements: 11 })),
    ).toEqual({
      code: "WING_BASEMENTS_INVALID",
      details: { field: "basements" },
    });
    expect(
      codeOf(() => wingConfig("plotting_scheme", { units: 2001 })),
    ).toEqual({
      code: "WING_SCHEME_UNITS_INVALID",
      details: { field: "units" },
    });
    expect(codeOf(() => wingConfig("plotting_scheme", { units: 0 })).code).toBe(
      "WING_SCHEME_UNITS_INVALID",
    );
    // The edges are allowed.
    expect(() =>
      wingConfig("commercial", {
        floors: 0,
        startNumber: 999,
        unitsPerFloor: 1,
        basements: 10,
      }),
    ).not.toThrow();
    expect(() =>
      wingConfig("bungalow_scheme", { units: 2000, startNumber: 0 }),
    ).not.toThrow();
  });

  it("refuses more than 5,000 units in a Wing", () => {
    // 100 floors + Ground at 50 = 5,050.
    expect(
      codeOf(() =>
        wingConfig("residential", {
          floors: 100,
          startNumber: 1,
          unitsPerFloor: 50,
        }),
      ).code,
    ).toBe("WING_TOO_MANY_UNITS");
    // 99 floors + Ground at 50 = 5,000.
    const floors = generate("residential", {
      floors: 99,
      startNumber: 1,
      unitsPerFloor: 50,
    });
    expect(wingTotals(floors).units).toBe(5000);
    expect(
      codeOf(() =>
        wingConfig("residential_and_commercial", {
          commercialFloors: 100,
          commercialUnitsPerFloor: 1,
          residentialFloors: 51,
          residentialUnitsPerFloor: 1,
          startNumber: 1,
        }),
      ),
    ).toEqual({
      code: "WING_FLOORS_INVALID",
      details: { field: "residentialFloors" },
    });
  });

  it("generates unique unit names across a tall Wing", () => {
    const floors = generate("commercial", {
      floors: 150,
      startNumber: 999,
      unitsPerFloor: 30,
      basements: 10,
    });
    const names = floors.flatMap((floor) => floor.units);
    expect(new Set(names).size).toBe(names.length);
    expect(floors[1]?.name).toBe("Commercial Floor 1148");
    expect(floors[1]?.units[0]).toBe("114801");
    expect(floors.at(-1)?.name).toBe("Basement Floor 1");
  });

  it("suggests the next unit name for + Add", () => {
    const wing = ["101", "102", "G01", "Plot 4"];
    expect(
      suggestUnitName(
        {
          kind: "typed",
          name: "Commercial Floor 1",
          units: [{ name: "101" }, { name: "102" }],
        },
        wing,
      ),
    ).toBe("103");
    expect(
      suggestUnitName(
        { kind: "ground", name: "Ground Floor", units: [] },
        wing,
      ),
    ).toBe("G02");
    expect(
      suggestUnitName(
        { kind: "terrace", name: "Terrace Floor", units: [] },
        wing,
      ),
    ).toBe("T01");
    expect(
      suggestUnitName(
        { kind: "basement", name: "Basement Floor 1", units: [] },
        wing,
      ),
    ).toBe("B101");
    expect(
      suggestUnitName(
        { kind: "typed", name: "Residential Floor 12", units: [] },
        wing,
      ),
    ).toBe("1201");
    expect(
      suggestUnitName({ kind: "other", name: "Stilt Floor", units: [] }, wing),
    ).toBe("S01");
    expect(
      suggestUnitName(
        { kind: "site", name: "Plots", units: [{ name: "Plot 3" }] },
        wing,
      ),
    ).toBe("Plot 5");
    expect(
      suggestUnitName({ kind: "site", name: "Bungalows", units: [] }, []),
    ).toBe("Bungalow 1");
  });
});
