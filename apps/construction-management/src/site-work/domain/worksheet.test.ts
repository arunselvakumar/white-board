import { describe, expect, it } from "vitest";

import { DomainError } from "@/src/shared-kernel/domain-error";

import {
  addNewFrom,
  assertSheetDateNotFuture,
  attendanceHeadcount,
  decideWorksheet,
  DEFAULT_WORKSHEET_SETTINGS,
  duplicateOf,
  labourPrefill,
  savedApproval,
  worksheetContent,
  worksheetLines,
  worksheetSettings,
  type WorksheetApproval,
  type WorksheetContent,
  type WorksheetFacts,
  type WorksheetInput,
  type WorksheetSettings,
} from "./worksheet";

const CONTRACTOR = "0199c4a0-0000-7000-8000-000000000c01";
const DEPARTMENT = "0199c4a0-0000-7000-8000-000000000d01";
const OTHER_DEPARTMENT = "0199c4a0-0000-7000-8000-000000000d02";
const WORK_TYPE = "0199c4a0-0000-7000-8000-000000000e01";
const UNIT = "0199c4a0-0000-7000-8000-000000000f01";
const CEMENT = "0199c4a0-0000-7000-8000-00000000a001";
const SAND = "0199c4a0-0000-7000-8000-00000000a002";
const AT = new Date("2026-10-11T05:00:00.000Z");
const BY = { userId: "user-1", at: AT };

const settings = (
  patch: Partial<WorksheetSettings> = {},
): WorksheetSettings => ({
  ...DEFAULT_WORKSHEET_SETTINGS,
  sectionOrder: [...DEFAULT_WORKSHEET_SETTINGS.sectionOrder],
  ...patch,
});

function facts(patch: Partial<WorksheetFacts> = {}): WorksheetFacts {
  return {
    contractor: {
      id: CONTRACTOR,
      isActive: true,
      onProject: true,
      departmentIds: [DEPARTMENT],
    },
    department: { id: DEPARTMENT, disabled: false },
    workType: { id: WORK_TYPE, departmentId: DEPARTMENT, disabled: false },
    unit: { id: UNIT, disabled: false },
    materials: new Map([
      [
        CEMENT,
        { id: CEMENT, name: "Cement OPC 53", unitName: "Bag", disabled: false },
      ],
      [SAND, { id: SAND, name: "M Sand", unitName: "cum", disabled: false }],
    ]),
    ...patch,
  };
}

function input(patch: Partial<WorksheetInput> = {}): WorksheetInput {
  return {
    sheetDate: "2026-10-10",
    shift: "shift_1",
    contractorId: CONTRACTOR,
    departmentId: DEPARTMENT,
    workTypeId: WORK_TYPE,
    skilledCount: 4,
    unskilledCount: 6,
    approxWorkQty: "12.5",
    approxWorkUnitId: UNIT,
    siteLocation: { type: "location", locationId: "loc-1" },
    remark: "  Slab shuttering, 3rd floor  ",
    materials: [{ materialId: CEMENT, quantity: "10" }],
    ...patch,
  };
}

function codeOf(fn: () => unknown): string | undefined {
  try {
    fn();
  } catch (error) {
    if (error instanceof DomainError) return error.code;
    throw error;
  }
  return undefined;
}

describe("worksheet settings", () => {
  it("defaults to everything shown, approval off, the four sections in order", () => {
    expect(DEFAULT_WORKSHEET_SETTINGS).toMatchObject({
      showLocation: true,
      showPhotos: true,
      approvalEnabled: false,
      sectionOrder: ["location", "basic", "materials", "other"],
    });
  });

  it("takes any order of the four sections, each once", () => {
    expect(
      worksheetSettings({
        ...settings(),
        sectionOrder: ["basic", "materials", "location", "other"],
      }).sectionOrder,
    ).toEqual(["basic", "materials", "location", "other"]);
    for (const order of [
      ["basic", "materials", "location"],
      ["basic", "basic", "location", "other"],
      ["basic", "materials", "location", "photos"],
    ])
      expect(
        codeOf(() => worksheetSettings({ ...settings(), sectionOrder: order })),
      ).toBe("SECTION_ORDER_INVALID");
  });
});

describe("worksheet content", () => {
  it("normalises a full sheet", () => {
    const content = worksheetContent(input(), settings(), facts());
    expect(content).toMatchObject({
      shift: "shift_1",
      contractorId: CONTRACTOR,
      departmentId: DEPARTMENT,
      workTypeId: WORK_TYPE,
      skilledCount: 4,
      unskilledCount: 6,
      approxWorkQty: "12.500",
      approxWorkUnitId: UNIT,
      remark: "Slab shuttering, 3rd floor",
      lines: [
        {
          materialId: CEMENT,
          materialName: "Cement OPC 53",
          unitName: "Bag",
          quantity: "10.000",
          remark: null,
        },
      ],
    });
  });

  it("requires Contractor, Department and Work Shift", () => {
    expect(
      codeOf(() =>
        worksheetContent(input({ contractorId: null }), settings(), facts()),
      ),
    ).toBe("CONTRACTOR_REQUIRED");
    expect(
      codeOf(() =>
        worksheetContent(input({ departmentId: "" }), settings(), facts()),
      ),
    ).toBe("DEPARTMENT_REQUIRED");
    expect(
      codeOf(() =>
        worksheetContent(input({ shift: "shift_4" }), settings(), facts()),
      ),
    ).toBe("WORK_SHIFT_REQUIRED");
  });

  it("refuses a Contractor off the Project and a Department not theirs", () => {
    expect(
      codeOf(() =>
        worksheetContent(
          input(),
          settings(),
          facts({
            contractor: {
              id: CONTRACTOR,
              isActive: true,
              onProject: false,
              departmentIds: [DEPARTMENT],
            },
          }),
        ),
      ),
    ).toBe("CONTRACTOR_NOT_ON_PROJECT");
    expect(
      codeOf(() =>
        worksheetContent(input(), settings(), facts({ contractor: null })),
      ),
    ).toBe("CONTRACTOR_NOT_FOUND");
    expect(
      codeOf(() =>
        worksheetContent(
          input({ departmentId: OTHER_DEPARTMENT }),
          settings(),
          facts({ department: { id: OTHER_DEPARTMENT, disabled: false } }),
        ),
      ),
    ).toBe("DEPARTMENT_NOT_CONTRACTORS");
  });

  it("refuses a Work Type of another Department", () => {
    expect(
      codeOf(() =>
        worksheetContent(
          input(),
          settings(),
          facts({
            workType: {
              id: WORK_TYPE,
              departmentId: OTHER_DEPARTMENT,
              disabled: false,
            },
          }),
        ),
      ),
    ).toBe("WORK_TYPE_NOT_DEPARTMENTS");
    expect(
      worksheetContent(input({ workTypeId: null }), settings(), facts())
        .workTypeId,
    ).toBeNull();
  });

  it("requires a location only when the Location section is shown", () => {
    expect(
      codeOf(() =>
        worksheetContent(input({ siteLocation: null }), settings(), facts()),
      ),
    ).toBe("LOCATION_REQUIRED");
    expect(
      worksheetContent(
        input({ siteLocation: { type: "location", locationId: "x" } }),
        settings({ showLocation: false }),
        facts(),
      ).siteLocation,
    ).toBeNull();
  });

  it("needs at least one head with Labour shown, counts ≥ 0", () => {
    expect(
      codeOf(() =>
        worksheetContent(
          input({ skilledCount: 0, unskilledCount: 0 }),
          settings(),
          facts(),
        ),
      ),
    ).toBe("LABOUR_COUNT_REQUIRED");
    expect(
      codeOf(() =>
        worksheetContent(input({ skilledCount: -1 }), settings(), facts()),
      ),
    ).toBe("LABOUR_COUNT_INVALID");
    expect(
      codeOf(() =>
        worksheetContent(input({ unskilledCount: 1.5 }), settings(), facts()),
      ),
    ).toBe("LABOUR_COUNT_INVALID");
    const hidden = worksheetContent(
      input({ skilledCount: 0, unskilledCount: 0 }),
      settings({ showLabour: false }),
      facts(),
    );
    expect(hidden.skilledCount).toBeNull();
    expect(hidden.unskilledCount).toBeNull();
  });

  it("needs a unit for Approx Work Done, and a quantity above zero", () => {
    expect(
      codeOf(() =>
        worksheetContent(
          input({ approxWorkUnitId: null }),
          settings(),
          facts(),
        ),
      ),
    ).toBe("APPROX_WORK_UNIT_REQUIRED");
    expect(
      codeOf(() =>
        worksheetContent(input({ approxWorkQty: "0" }), settings(), facts()),
      ),
    ).toBe("APPROX_WORK_QTY_INVALID");
    expect(
      codeOf(() =>
        worksheetContent(
          input({ approxWorkQty: "1.2345" }),
          settings(),
          facts(),
        ),
      ),
    ).toBe("APPROX_WORK_QTY_INVALID");
    const none = worksheetContent(
      input({ approxWorkQty: "", approxWorkUnitId: UNIT }),
      settings(),
      facts(),
    );
    expect(none.approxWorkQty).toBeNull();
    expect(none.approxWorkUnitId).toBeNull();
  });

  it("keeps a remark to 500 characters", () => {
    expect(
      codeOf(() =>
        worksheetContent(
          input({ remark: "x".repeat(501) }),
          settings(),
          facts(),
        ),
      ),
    ).toBe("TEXT_TOO_LONG");
    expect(
      worksheetContent(input({ remark: "   " }), settings(), facts()).remark,
    ).toBeNull();
  });

  it("neither validates nor stores hidden sections; an edit keeps what was there", () => {
    const hiddenAll = settings({
      showLocation: false,
      showWorkType: false,
      showApproxWorkDone: false,
      showLabour: false,
      showMaterials: false,
      showRemark: false,
    });
    const bad = input({
      siteLocation: null,
      workTypeId: "not-a-work-type",
      skilledCount: -5,
      approxWorkQty: "abc",
      remark: "x".repeat(900),
      materials: [{ materialId: CEMENT, quantity: "-1" }],
    });
    const created = worksheetContent(bad, hiddenAll, facts({ workType: null }));
    expect(created).toMatchObject({
      siteLocation: null,
      workTypeId: null,
      skilledCount: null,
      approxWorkQty: null,
      remark: null,
      lines: [],
    });
    const previous: WorksheetContent = worksheetContent(
      input(),
      settings(),
      facts(),
    );
    const edited = worksheetContent(
      { ...bad, shift: "shift_2" },
      hiddenAll,
      facts({ workType: null }),
      previous,
    );
    expect(edited).toMatchObject({
      shift: "shift_2",
      siteLocation: previous.siteLocation,
      workTypeId: WORK_TYPE,
      skilledCount: 4,
      unskilledCount: 6,
      approxWorkQty: "12.500",
      remark: "Slab shuttering, 3rd floor",
      lines: previous.lines,
    });
  });

  it("drops a kept Work Type when the Department changes under a hidden section", () => {
    const OTHER = "01a12900-0000-7000-8000-0000000000ff";
    const previous = worksheetContent(input(), settings(), facts());
    const moved = worksheetContent(
      input({ departmentId: OTHER, workTypeId: null }),
      settings({ showWorkType: false }),
      facts({
        contractor: {
          id: CONTRACTOR,
          isActive: true,
          onProject: true,
          departmentIds: [DEPARTMENT, OTHER],
        },
        department: { id: OTHER, disabled: false },
      }),
      previous,
    );
    expect(moved.departmentId).toBe(OTHER);
    expect(moved.workTypeId).toBeNull();
  });

  it("keeps a disabled Department or Work Type the sheet already had", () => {
    const previous = worksheetContent(input(), settings(), facts());
    const disabled = facts({
      department: { id: DEPARTMENT, disabled: true },
      workType: { id: WORK_TYPE, departmentId: DEPARTMENT, disabled: true },
    });
    expect(codeOf(() => worksheetContent(input(), settings(), disabled))).toBe(
      "DEPARTMENT_NOT_FOUND",
    );
    expect(
      worksheetContent(input(), settings(), disabled, previous).departmentId,
    ).toBe(DEPARTMENT);
  });

  it("refuses a sheet dated after today", () => {
    expect(
      codeOf(() => {
        assertSheetDateNotFuture("2026-10-12", "2026-10-11");
      }),
    ).toBe("SHEET_DATE_IN_FUTURE");
    expect(
      codeOf(() => {
        assertSheetDateNotFuture("2026-10-11", "2026-10-11");
      }),
    ).toBeUndefined();
  });
});

describe("worksheet material lines", () => {
  const materials = facts().materials;

  it("allows none and at most 100", () => {
    expect(worksheetLines([], materials)).toEqual([]);
    expect(
      codeOf(() =>
        worksheetLines(
          Array.from({ length: 101 }, () => ({
            materialId: CEMENT,
            quantity: "1",
          })),
          materials,
        ),
      ),
    ).toBe("TOO_MANY_MATERIALS");
  });

  it("refuses a repeated material, an unknown one and a bad quantity", () => {
    expect(
      codeOf(() =>
        worksheetLines(
          [
            { materialId: CEMENT, quantity: "1" },
            { materialId: CEMENT, quantity: "2" },
          ],
          materials,
        ),
      ),
    ).toBe("MATERIAL_REPEATED");
    expect(
      codeOf(() =>
        worksheetLines([{ materialId: "unknown", quantity: "1" }], materials),
      ),
    ).toBe("MATERIAL_NOT_FOUND");
    for (const quantity of ["0", "-2", "1.0001", "abc", "100000000000"])
      expect(
        codeOf(() =>
          worksheetLines([{ materialId: SAND, quantity }], materials),
        ),
      ).toBe("QUANTITY_INVALID");
    expect(
      worksheetLines([{ materialId: SAND, quantity: "2.125" }], materials)[0]
        ?.quantity,
    ).toBe("2.125");
  });

  it("refuses a disabled material unless the sheet already had it", () => {
    const disabled = new Map([
      [
        CEMENT,
        { id: CEMENT, name: "Cement OPC 53", unitName: "Bag", disabled: true },
      ],
    ]);
    const line = [{ materialId: CEMENT, quantity: "1" }];
    expect(codeOf(() => worksheetLines(line, disabled))).toBe(
      "MATERIAL_NOT_FOUND",
    );
    expect(
      worksheetLines(line, disabled, [
        {
          materialId: CEMENT,
          materialName: "Cement OPC 53",
          unitName: "Bag",
          quantity: "2.000",
          remark: null,
        },
      ]),
    ).toHaveLength(1);
  });
});

describe("worksheet approval", () => {
  const pending: WorksheetApproval = {
    status: "pending",
    decidedAt: null,
    decidedBy: null,
    rejectionReason: null,
  };

  it("is not required with approval off, pending or approved with it on", () => {
    expect(savedApproval(false, true, BY).status).toBe("not_required");
    expect(savedApproval(true, false, BY).status).toBe("pending");
    expect(savedApproval(true, true, BY)).toMatchObject({
      status: "approved",
      decidedBy: "user-1",
      decidedAt: AT,
    });
  });

  it("approves or rejects (with a reason) only a pending sheet", () => {
    expect(decideWorksheet(pending, { approve: true }, BY).status).toBe(
      "approved",
    );
    expect(
      decideWorksheet(pending, { approve: false, reason: " Wrong floor " }, BY),
    ).toMatchObject({ status: "rejected", rejectionReason: "Wrong floor" });
    expect(
      codeOf(() =>
        decideWorksheet(pending, { approve: false, reason: " " }, BY),
      ),
    ).toBe("REJECTION_REASON_REQUIRED");
    for (const status of ["approved", "rejected", "not_required"] as const)
      expect(
        codeOf(() =>
          decideWorksheet({ ...pending, status }, { approve: true }, BY),
        ),
      ).toBe("WORKSHEET_NOT_PENDING");
  });
});

describe("labour prefill", () => {
  it("counts heads by skill; no category counts as unskilled", () => {
    expect(
      attendanceHeadcount([
        { skill: "skilled", heads: 3 },
        { skill: "unskilled", heads: 2 },
        { skill: null, heads: 1 },
        { skill: "skilled", heads: 4 },
      ]),
    ).toEqual({ skilled: 7, unskilled: 3 });
  });

  it("subtracts other worksheets, never below zero", () => {
    expect(
      labourPrefill({ skilled: 7, unskilled: 3 }, { skilled: 2, unskilled: 5 }),
    ).toEqual({
      attendance: { skilled: 7, unskilled: 3 },
      onWorksheets: { skilled: 2, unskilled: 5 },
      remaining: { skilled: 5, unskilled: 0 },
    });
  });
});

describe("duplicate and Save & Add New", () => {
  it("duplicates everything but the date", () => {
    const source = worksheetContent(input(), settings(), facts());
    const copy = duplicateOf(source, "2026-10-11");
    expect(copy).toEqual({ ...source, sheetDate: "2026-10-11" });
    expect(copy.lines).not.toBe(source.lines);
  });

  it("keeps the date, location, contractor and shift", () => {
    const source = worksheetContent(input(), settings(), facts());
    expect(addNewFrom(source)).toEqual({
      sheetDate: "2026-10-10",
      siteLocation: source.siteLocation,
      contractorId: CONTRACTOR,
      shift: "shift_1",
    });
  });
});
