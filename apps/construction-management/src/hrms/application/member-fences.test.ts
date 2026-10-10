import { describe, expect, it } from "vitest";

import type { Fence } from "../domain/branch";
import { MemberFences, type MemberFenceSource } from "./member-fences";
import type { EmployeeDirectory, HrmsEmployee } from "./ports";

const FENCES: Fence[] = [
  {
    id: "chennai",
    kind: "office_branch",
    name: "Chennai Office",
    projectId: null,
    latitude: 13.08,
    longitude: 80.27,
    radiusMetres: 100,
  },
  {
    id: "madurai",
    kind: "office_branch",
    name: "Madurai Office",
    projectId: null,
    latitude: 9.93,
    longitude: 78.12,
    radiusMetres: 100,
  },
  {
    id: "site",
    kind: "project_site",
    name: "Tower A",
    projectId: "p1",
    latitude: 13.1,
    longitude: 80.28,
    radiusMetres: 300,
  },
];

function employee(overrides: Partial<HrmsEmployee>): HrmsEmployee {
  return {
    memberId: "m1",
    userId: "u1",
    name: "Prabhu",
    memberType: "normal",
    designationId: "d1",
    designationName: "Site Engineer",
    projectIds: [],
    active: true,
    isOwner: false,
    ...overrides,
  };
}

function directory(employees: HrmsEmployee[]): EmployeeDirectory {
  return {
    list: () => Promise.resolve(employees),
    find: (_workspaceId, ids) =>
      Promise.resolve(
        new Map(
          employees
            .filter((item) => ids.includes(item.memberId))
            .map((item) => [item.memberId, item]),
        ),
      ),
    findByUserId: (_workspaceId, userId) =>
      Promise.resolve(employees.find((item) => item.userId === userId) ?? null),
  };
}

function source(links: Record<string, string[]>): MemberFenceSource {
  return {
    fences: () => Promise.resolve(FENCES),
    linkedBranchIds: (_workspaceId, memberId) =>
      Promise.resolve(links[memberId] ?? []),
  };
}

describe("MemberFences", () => {
  it("gives linked branches plus the member's Project sites", async () => {
    const fences = new MemberFences(
      source({ m1: ["madurai"] }),
      directory([employee({ projectIds: ["p1"] })]),
    );
    expect(
      (await fences.fencesFor("c1", "m1")).map((fence) => fence.id),
    ).toEqual(["madurai", "site"]);
  });

  it("gives every office branch to an unlinked member", async () => {
    const fences = new MemberFences(
      source({}),
      directory([employee({ memberType: "hrms", projectIds: ["p1"] })]),
    );
    expect(
      (await fences.fencesFor("c1", "m1")).map((fence) => fence.id),
    ).toEqual(["chennai", "madurai"]);
  });

  it("gives an unknown member nothing", async () => {
    const fences = new MemberFences(source({}), directory([]));
    expect(await fences.fencesFor("c1", "ghost")).toEqual([]);
  });
});
