import { describe, expect, it } from "vitest";

import { DomainError } from "@/src/shared-kernel/domain-error";

import {
  assertMaintenanceEnd,
  assertTransfer,
  equipmentSheetBlocker,
  maintenanceCost,
  projectOn,
  type MovementFact,
  type TransferCheck,
} from "./equipment-lifecycle";

const TOWER = "tower";
const VILLA = "villa";

function at(iso: string): Date {
  return new Date(iso);
}

/** Added to Tower on 1 Oct, to Villa on 5 Oct, to the warehouse on 9 Oct. */
const MOVEMENTS: MovementFact[] = [
  {
    movementDate: "2026-10-05",
    toProjectId: VILLA,
    createdAt: at("2026-10-05T10:00:00Z"),
  },
  {
    movementDate: "2026-10-01",
    toProjectId: TOWER,
    createdAt: at("2026-10-01T10:00:00Z"),
  },
  {
    movementDate: "2026-10-09",
    toProjectId: null,
    createdAt: at("2026-10-09T10:00:00Z"),
  },
];

function blocker(
  patch: Partial<Parameters<typeof equipmentSheetBlocker>[0]> = {},
) {
  return equipmentSheetBlocker({
    date: "2026-10-03",
    projectId: TOWER,
    availableForEntry: true,
    movements: MOVEMENTS,
    maintenance: [],
    ...patch,
  });
}

describe("equipmentSheetBlocker", () => {
  it("allows a sheet where it was on that date", () => {
    expect(blocker()).toBeNull();
    expect(blocker({ date: "2026-10-01" })).toBeNull();
    expect(blocker({ date: "2026-10-05", projectId: VILLA })).toBeNull();
    expect(blocker({ date: "2026-10-08", projectId: VILLA })).toBeNull();
  });

  it("refuses before its first movement, elsewhere, or at the warehouse", () => {
    expect(blocker({ date: "2026-09-30" })).toBe("EQUIPMENT_NOT_ON_PROJECT");
    expect(blocker({ date: "2026-10-05" })).toBe("EQUIPMENT_NOT_ON_PROJECT");
    expect(blocker({ date: "2026-10-09", projectId: VILLA })).toBe(
      "EQUIPMENT_NOT_ON_PROJECT",
    );
    expect(blocker({ movements: [] })).toBe("EQUIPMENT_NOT_ON_PROJECT");
  });

  it("breaks same-day movements by when they were recorded", () => {
    const sameDay: MovementFact[] = [
      {
        movementDate: "2026-10-01",
        toProjectId: VILLA,
        createdAt: at("2026-10-01T12:00:00Z"),
      },
      {
        movementDate: "2026-10-01",
        toProjectId: TOWER,
        createdAt: at("2026-10-01T09:00:00Z"),
      },
    ];
    expect(projectOn("2026-10-01", sameDay)).toBe(VILLA);
    expect(blocker({ date: "2026-10-01", movements: sameDay })).toBe(
      "EQUIPMENT_NOT_ON_PROJECT",
    );
  });

  it("refuses dates a maintenance entry covers", () => {
    const closed = [{ startDate: "2026-10-02", endDate: "2026-10-03" }];
    expect(blocker({ date: "2026-10-02", maintenance: closed })).toBe(
      "EQUIPMENT_IN_MAINTENANCE",
    );
    expect(blocker({ date: "2026-10-03", maintenance: closed })).toBe(
      "EQUIPMENT_IN_MAINTENANCE",
    );
    expect(blocker({ date: "2026-10-04", maintenance: closed })).toBeNull();
    const open = [{ startDate: "2026-10-04", endDate: null }];
    expect(blocker({ date: "2026-10-03", maintenance: open })).toBeNull();
    expect(
      blocker({ date: "2026-10-07", projectId: VILLA, maintenance: open }),
    ).toBe("EQUIPMENT_IN_MAINTENANCE");
  });

  it("refuses while marked unavailable, after the place and maintenance checks", () => {
    expect(blocker({ availableForEntry: false })).toBe("EQUIPMENT_UNAVAILABLE");
    expect(blocker({ availableForEntry: false, projectId: VILLA })).toBe(
      "EQUIPMENT_NOT_ON_PROJECT",
    );
    expect(
      blocker({
        availableForEntry: false,
        maintenance: [{ startDate: "2026-10-03", endDate: null }],
      }),
    ).toBe("EQUIPMENT_IN_MAINTENANCE");
  });
});

const TRANSFER: TransferCheck = {
  kind: "to_project",
  movementDate: "2026-10-10",
  today: "2026-10-11",
  currentProjectId: TOWER,
  toProjectId: VILLA,
  lastMovementDate: "2026-10-05",
  lastSheetDate: "2026-10-08",
  inMaintenance: false,
};

function transferRefusal(patch: Partial<TransferCheck>): string {
  try {
    assertTransfer({ ...TRANSFER, ...patch });
  } catch (error) {
    if (error instanceof DomainError) return error.code;
    throw error;
  }
  return "allowed";
}

describe("assertTransfer", () => {
  it("allows a transfer on or after the last movement, after the last sheet", () => {
    expect(transferRefusal({})).toBe("allowed");
    expect(transferRefusal({ movementDate: "2026-10-09" })).toBe("allowed");
    expect(transferRefusal({ movementDate: "2026-10-11" })).toBe("allowed");
    expect(
      transferRefusal({
        kind: "to_warehouse",
        toProjectId: null,
      }),
    ).toBe("allowed");
    expect(
      transferRefusal({ currentProjectId: null, lastSheetDate: null }),
    ).toBe("allowed");
  });

  it("refuses the future, before the last movement, before the last sheet", () => {
    expect(transferRefusal({ movementDate: "2026-10-12" })).toBe(
      "TRANSFER_DATE_IN_FUTURE",
    );
    expect(
      transferRefusal({ movementDate: "2026-10-04", lastSheetDate: null }),
    ).toBe("TRANSFER_BEFORE_LAST_MOVEMENT");
    expect(transferRefusal({ movementDate: "2026-10-07" })).toBe(
      "TRANSFER_BEFORE_LAST_SHEET",
    );
    // The machine was at the source Project that day.
    expect(transferRefusal({ movementDate: "2026-10-08" })).toBe(
      "TRANSFER_BEFORE_LAST_SHEET",
    );
  });

  it("refuses the same Project, a missing one, and the warehouse twice", () => {
    expect(transferRefusal({ toProjectId: TOWER })).toBe(
      "TRANSFER_SAME_PROJECT",
    );
    expect(transferRefusal({ toProjectId: null })).toBe("TO_PROJECT_REQUIRED");
    expect(
      transferRefusal({
        kind: "to_warehouse",
        toProjectId: null,
        currentProjectId: null,
      }),
    ).toBe("EQUIPMENT_AT_WAREHOUSE");
  });

  it("refuses while in maintenance", () => {
    expect(transferRefusal({ inMaintenance: true })).toBe(
      "EQUIPMENT_IN_MAINTENANCE",
    );
  });
});

describe("maintenance", () => {
  it("returns to service on or after the start, not after today", () => {
    expect(() => {
      assertMaintenanceEnd("2026-10-05", "2026-10-05", "2026-10-11");
    }).not.toThrow();
    expect(() => {
      assertMaintenanceEnd("2026-10-05", "2026-10-04", "2026-10-11");
    }).toThrow(/Choose that date or later/);
    expect(() => {
      assertMaintenanceEnd("2026-10-05", "2026-10-12", "2026-10-11");
    }).toThrow(/after today/);
  });

  it("takes a cost in whole paise", () => {
    expect(maintenanceCost(null)).toBeNull();
    expect(maintenanceCost(250_000)).toBe(250_000n);
    expect(() => maintenanceCost(-1)).toThrow();
    expect(() => maintenanceCost(1.5)).toThrow();
  });
});
