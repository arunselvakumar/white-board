import { describe, expect, it } from "vitest";

import { DomainError } from "@/src/shared-kernel/domain-error";

import {
  MAX_ACCURACY_ALLOWANCE_METRES,
  createBranch,
  distanceToFence,
  fencesForMember,
  isInside,
  isInsideAnyFence,
  matchFence,
  type Fence,
} from "./branch";

const OFFICE = {
  kind: "office_branch",
  name: "  Head Office ",
  latitude: 13.0827,
  longitude: 80.2707,
  radiusMetres: 100,
};

function fieldOf(run: () => unknown): { code: string; field: unknown } {
  try {
    run();
  } catch (error) {
    if (error instanceof DomainError)
      return {
        code: error.code,
        field: (error.details as { field?: unknown } | undefined)?.field,
      };
    throw error;
  }
  throw new Error("Expected a DomainError");
}

function fence(overrides: Partial<Fence> = {}): Fence {
  return {
    id: "office",
    kind: "office_branch",
    name: "Head Office",
    projectId: null,
    latitude: 13.0827,
    longitude: 80.2707,
    radiusMetres: 100,
    ...overrides,
  };
}

/** A point `metres` due north of the fence centre (0.001° ≈ 111.2 m). */
function north(of: Fence, metres: number) {
  return {
    latitude: of.latitude + (metres / 111_195) * 1,
    longitude: of.longitude,
  };
}

describe("createBranch", () => {
  it("trims the name, rounds coordinates to 6 decimals and drops a project on an office", () => {
    const branch = createBranch({
      ...OFFICE,
      latitude: 13.08271234,
      longitude: 80.27070009,
      address: "  ",
      projectId: "ignored",
    });
    expect(branch).toEqual({
      kind: "office_branch",
      name: "Head Office",
      address: null,
      projectId: null,
      latitude: 13.082712,
      longitude: 80.2707,
      radiusMetres: 100,
    });
  });

  it("needs a Project for a site fence", () => {
    expect(
      fieldOf(() =>
        createBranch({ ...OFFICE, kind: "project_site", name: "Gate 2" }),
      ),
    ).toEqual({ code: "BRANCH_PROJECT_REQUIRED", field: "projectId" });
    expect(
      createBranch({
        ...OFFICE,
        kind: "project_site",
        name: "Gate 2",
        projectId: "p1",
      }).projectId,
    ).toBe("p1");
  });

  it("keeps the radius between 25 m and 5 km, whole metres", () => {
    expect(createBranch({ ...OFFICE, radiusMetres: 25 }).radiusMetres).toBe(25);
    expect(createBranch({ ...OFFICE, radiusMetres: 5000 }).radiusMetres).toBe(
      5000,
    );
    for (const radiusMetres of [24, 5001, 50.5, Number.NaN])
      expect(fieldOf(() => createBranch({ ...OFFICE, radiusMetres }))).toEqual({
        code: "BRANCH_RADIUS_INVALID",
        field: "radiusMetres",
      });
  });

  it("refuses coordinates off the globe, a blank name and an unknown kind", () => {
    expect(fieldOf(() => createBranch({ ...OFFICE, latitude: 90.1 }))).toEqual({
      code: "BRANCH_LATITUDE_INVALID",
      field: "latitude",
    });
    expect(
      fieldOf(() => createBranch({ ...OFFICE, longitude: -180.5 })),
    ).toEqual({ code: "BRANCH_LONGITUDE_INVALID", field: "longitude" });
    expect(fieldOf(() => createBranch({ ...OFFICE, name: " " }))).toEqual({
      code: "BRANCH_NAME_REQUIRED",
      field: "name",
    });
    expect(
      fieldOf(() => createBranch({ ...OFFICE, name: "x".repeat(81) })),
    ).toEqual({ code: "BRANCH_NAME_TOO_LONG", field: "name" });
    expect(
      fieldOf(() => createBranch({ ...OFFICE, kind: "warehouse" })),
    ).toEqual({ code: "BRANCH_KIND_INVALID", field: "kind" });
    expect(
      createBranch({ ...OFFICE, latitude: -90, longitude: 180 }),
    ).toMatchObject({ latitude: -90, longitude: 180 });
  });
});

describe("isInside", () => {
  const office = fence();

  it("counts the boundary as inside and a metre beyond as outside", () => {
    const edge = north(office, 100);
    expect(distanceToFence(office, edge)).toBeCloseTo(100, 1);
    expect(isInside(office, north(office, 99.5))).toBe(true);
    expect(isInside(office, north(office, 101))).toBe(false);
    expect(isInside(office, office)).toBe(true);
  });

  it("gives the device's accuracy to the member, up to 50 m", () => {
    const point = north(office, 130);
    expect(isInside(office, point)).toBe(false);
    expect(isInside(office, point, 31)).toBe(true);
    expect(isInside(office, north(office, 160), 5000)).toBe(false);
    expect(
      isInside(
        office,
        north(office, 100 + MAX_ACCURACY_ALLOWANCE_METRES - 1),
        5000,
      ),
    ).toBe(true);
  });

  it("ignores a negative or missing accuracy", () => {
    const point = north(office, 110);
    expect(isInside(office, point, -40)).toBe(false);
    expect(isInside(office, point, Number.NaN)).toBe(false);
    expect(isInside(office, point, null)).toBe(false);
  });
});

describe("matchFence / isInsideAnyFence", () => {
  const office = fence();
  const site = fence({
    id: "site",
    kind: "project_site",
    name: "Tower A",
    projectId: "p1",
    latitude: 13.0847,
    radiusMetres: 200,
  });

  it("picks the nearest fence the point is inside", () => {
    // 40 m from the office, about 182 m from the site: inside both.
    const point = north(office, 40);
    expect(matchFence([site, office], point)?.fence.id).toBe("office");
    expect(matchFence([site, office], point)?.distanceMetres).toBeCloseTo(
      40,
      0,
    );
    // Past the office fence, inside the site's.
    expect(matchFence([office, site], north(office, 150))?.fence.id).toBe(
      "site",
    );
    expect(isInsideAnyFence([office, site], point)).toBe(true);
  });

  it("is outside with no fences or far away", () => {
    expect(matchFence([], office)).toBeNull();
    expect(isInsideAnyFence([], office)).toBe(false);
    expect(
      isInsideAnyFence([office, site], { latitude: 12.97, longitude: 77.59 }),
    ).toBe(false);
  });
});

describe("fencesForMember (ADR CM-0012 §4)", () => {
  const chennai = fence({ id: "chennai", name: "Chennai" });
  const bengaluru = fence({ id: "bengaluru", name: "Bengaluru" });
  const towerA = fence({
    id: "tower-a",
    kind: "project_site",
    name: "Tower A",
    projectId: "p1",
  });
  const villas = fence({
    id: "villas",
    kind: "project_site",
    name: "Villas",
    projectId: "p2",
  });
  const all = [chennai, towerA, bengaluru, villas];
  const ids = (fences: Fence[]) => fences.map((item) => item.id);

  it("gives a linked member their branches plus their Projects' sites", () => {
    expect(
      ids(
        fencesForMember(
          {
            memberType: "normal",
            linkedBranchIds: ["chennai"],
            projectIds: ["p1"],
          },
          all,
        ),
      ),
    ).toEqual(["chennai", "tower-a"]);
  });

  it("gives a member linked to no branch every office branch", () => {
    expect(
      ids(
        fencesForMember(
          { memberType: "normal", linkedBranchIds: [], projectIds: ["p2"] },
          all,
        ),
      ),
    ).toEqual(["bengaluru", "chennai", "villas"]);
    // A link to a removed branch is no link.
    expect(
      ids(
        fencesForMember(
          { memberType: "normal", linkedBranchIds: ["gone"], projectIds: [] },
          all,
        ),
      ),
    ).toEqual(["bengaluru", "chennai"]);
  });

  it("gives an HRMS Team Member office branches only", () => {
    expect(
      ids(
        fencesForMember(
          {
            memberType: "hrms",
            linkedBranchIds: ["bengaluru"],
            projectIds: ["p1"],
          },
          all,
        ),
      ),
    ).toEqual(["bengaluru"]);
  });

  it("is empty when the Company has no fences", () => {
    expect(
      fencesForMember(
        { memberType: "normal", linkedBranchIds: [], projectIds: ["p1"] },
        [],
      ),
    ).toEqual([]);
  });
});
