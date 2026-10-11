import { describe, expect, it } from "vitest";

import { DomainError } from "@/src/shared-kernel/domain-error";

import { WorkType, cleanMaterialIds, cleanWorkTypeName } from "./work-type";

const NOW = new Date("2026-10-08T06:30:00.000Z");
const LATER = new Date("2026-10-08T07:00:00.000Z");
const RCC = "0199a1b2-0000-7000-8000-0000000000d1";
const PLUMBING = "0199a1b2-0000-7000-8000-0000000000d2";
const CEMENT = "0199a1b2-0000-7000-8000-0000000000m1";
const STEEL = "0199a1b2-0000-7000-8000-0000000000m2";

function codeOf(run: () => unknown): string | undefined {
  try {
    run();
  } catch (error) {
    if (error instanceof DomainError) return error.code;
    throw error;
  }
  return undefined;
}

function made() {
  return WorkType.create({
    id: "0199a1b2-0000-7000-8000-000000000001",
    workspaceId: "ws_1",
    details: {
      name: "  Column   casting ",
      departmentId: RCC,
      materialIds: [CEMENT, STEEL, CEMENT],
    },
    by: "user_1",
    now: NOW,
  });
}

function seed() {
  return WorkType.reconstitute({
    id: "0199a1b2-0000-7000-8000-000000000002",
    workspaceId: "ws_1",
    name: "RCC",
    departmentId: RCC,
    materialIds: [],
    isSeed: true,
    disabledAt: null,
    createdAt: NOW,
    updatedAt: NOW,
    createdBy: "system",
    updatedBy: "system",
    deletedAt: null,
    deletedBy: null,
  });
}

describe("WorkType (CM-601)", () => {
  it("cleans the name to at most 120 characters and each Material once", () => {
    const workType = made();
    expect(workType.name).toBe("Column casting");
    expect(workType.materialIds).toEqual([CEMENT, STEEL]);
    expect(cleanWorkTypeName("x".repeat(120))).toHaveLength(120);
    expect(codeOf(() => cleanWorkTypeName("x".repeat(121)))).toBe(
      "WORK_TYPE_NAME_TOO_LONG",
    );
    expect(codeOf(() => cleanWorkTypeName("   "))).toBe(
      "WORK_TYPE_NAME_REQUIRED",
    );
    expect(
      codeOf(() =>
        cleanMaterialIds(Array.from({ length: 201 }, (_, i) => String(i))),
      ),
    ).toBe("WORK_TYPE_MATERIALS_TOO_MANY");
  });

  it("changes, disables, enables and deletes a Company Work Type", () => {
    const workType = made();
    workType.update(
      { name: "Plumbing lines", departmentId: PLUMBING, materialIds: [] },
      "user_2",
      LATER,
    );
    expect(workType.snapshot()).toEqual({
      name: "Plumbing lines",
      departmentId: PLUMBING,
      materialIds: [],
      isSeed: false,
      disabled: false,
    });
    expect(workType.updatedBy).toBe("user_2");
    expect(workType.setDisabled(true, "user_2", LATER)).toBe(true);
    expect(workType.setDisabled(true, "user_2", LATER)).toBe(false);
    expect(workType.setDisabled(false, "user_2", LATER)).toBe(true);
    workType.delete("user_2", LATER);
    expect(workType.deletedAt).toEqual(LATER);
    expect(codeOf(() => workType.setDisabled(true, "user_2", LATER))).toBe(
      "WORK_TYPE_NOT_FOUND",
    );
  });

  it("keeps the seed's name and Department, but lets it take Materials and be disabled", () => {
    const rcc = seed();
    rcc.update(
      { name: "RCC", departmentId: RCC, materialIds: [CEMENT] },
      "user_2",
      LATER,
    );
    expect(rcc.materialIds).toEqual([CEMENT]);
    expect(
      codeOf(() => {
        rcc.update(
          { name: "Concrete", departmentId: RCC, materialIds: [] },
          "user_2",
          LATER,
        );
      }),
    ).toBe("SEED_IS_READ_ONLY");
    expect(
      codeOf(() => {
        rcc.update(
          { name: "RCC", departmentId: PLUMBING, materialIds: [] },
          "user_2",
          LATER,
        );
      }),
    ).toBe("SEED_IS_READ_ONLY");
    expect(rcc.setDisabled(true, "user_2", LATER)).toBe(true);
    expect(
      codeOf(() => {
        rcc.delete("user_2", LATER);
      }),
    ).toBe("SEED_IS_READ_ONLY");
  });
});
