import { describe, expect, it } from "vitest";

import { DomainError } from "@/src/shared-kernel/domain-error";

import {
  buildDailyWorkReport,
  consumedText,
  type ReportWorksheet,
} from "./daily-work-report";
import {
  buildEquipmentMaintenanceReport,
  buildEquipmentTransferReport,
  maintenanceDays,
  type ReportMaintenanceEntry,
} from "./equipment-lifecycle-reports";
import {
  buildEquipmentUsageReport,
  type ReportUsageSheet,
} from "./equipment-usage-report";
import type { ReportTable } from "./report-document";
import {
  canBeCentral,
  checkReportParams,
  checkReportScope,
  printsAmounts,
  reportFileName,
} from "./report-job";

function cell(table: ReportTable | undefined, row: number, label: string) {
  const index = table?.columns.findIndex((col) => col.label === label) ?? -1;
  return table?.rows[row]?.[index];
}

function total(table: ReportTable | undefined, label: string) {
  const index = table?.columns.findIndex((col) => col.label === label) ?? -1;
  return table?.totals?.[index];
}

function labels(table: ReportTable | undefined): string[] {
  return table?.columns.map((col) => col.label) ?? [];
}

const SHEET: ReportWorksheet = {
  date: "2026-09-02",
  number: "WS/2",
  department: "Masonry",
  contractor: "Velan Constructions",
  skilled: 4,
  unskilled: 6,
  locationType: "Wing",
  location: "Wing A · Floor 1",
  approxWorkQty: "12.500",
  approxWorkUnit: "cum",
  shift: "shift_1",
  photos: 2,
  materials: [
    { name: "Cement", unit: "Bag", quantity: "10.000" },
    { name: "Sand", unit: "cum", quantity: "2.250" },
  ],
  remark: "Ground floor brickwork",
};

describe("Daily Work report", () => {
  it("prints one row per worksheet in date order with consumed materials and totals", () => {
    const body = buildDailyWorkReport({
      worksheets: [
        SHEET,
        {
          ...SHEET,
          date: "2026-09-01",
          number: "WS/1",
          contractor: "Sri Murugan Works",
          department: "Shuttering",
          skilled: null,
          unskilled: 3,
          locationType: null,
          location: null,
          approxWorkQty: null,
          approxWorkUnit: null,
          shift: "shift_2",
          photos: 0,
          materials: [{ name: "Cement", unit: "Bag", quantity: "1.5" }],
          remark: null,
        },
      ],
      filters: { contractor: null },
    });
    expect(body.title).toBe("Daily Work Report");
    const [work, materials] = body.tables;
    expect(labels(work)).toEqual([
      "Date",
      "Number",
      "Department",
      "Contractor",
      "Skilled",
      "Unskilled",
      "Location type",
      "Location",
      "Approx work done",
      "Shift",
      "Photos",
      "Consumed material",
      "Remark",
    ]);
    expect(cell(work, 0, "Number")).toBe("WS/1");
    expect(cell(work, 0, "Skilled")).toBe(0);
    expect(cell(work, 0, "Shift")).toBe("Shift 2");
    expect(cell(work, 1, "Date")).toBe("02 Sep 2026");
    expect(cell(work, 1, "Approx work done")).toBe("12.5 cum");
    expect(cell(work, 1, "Consumed material")).toBe(
      "Cement 10 Bag; Sand 2.25 cum",
    );
    expect(total(work, "Skilled")).toBe(4);
    expect(total(work, "Unskilled")).toBe(9);
    expect(total(work, "Photos")).toBe(2);
    expect(work?.totals?.[0]).toBe("Total");
    // Materials per material and unit, added exactly.
    expect(materials?.rows).toEqual([
      ["Cement", "Bag", 11.5, 2],
      ["Sand", "cum", 2.25, 1],
    ]);
    expect(materials?.totals).toBeNull();
  });

  it("names the contractor filter", () => {
    const body = buildDailyWorkReport({
      worksheets: [],
      filters: { contractor: "Velan Constructions" },
    });
    expect(body.notes[0]).toBe("Contractor: Velan Constructions");
    expect(body.tables[0]?.rows).toEqual([]);
  });

  it("writes consumed material as `name quantity unit`", () => {
    expect(
      consumedText([
        { name: "Steel", unit: "kg", quantity: "120.000" },
        { name: "Water", unit: "", quantity: "3" },
      ]),
    ).toBe("Steel 120 kg; Water 3");
  });
});

const JCB: ReportUsageSheet = {
  date: "2026-09-01",
  number: "EU/1",
  equipmentId: "jcb",
  equipment: "JCB 3DX",
  equipmentNumber: "TN-01-AB-1234",
  shift: "shift_1",
  operator: "Ravi",
  basis: "hourly",
  usage: 7.5,
  idleHours: 0.5,
  breakdownHours: 0,
  fuelQty: 40.25,
  fuelUnit: "litre",
  fuelOverrun: false,
  contractor: "Velan Constructions",
  location: "Wing A",
  approval: "approved",
  hireParty: "Sri Balaji Hire",
  hireBasis: "hourly",
  unitRate: 120_000,
  billableQty: 8,
  hireCost: 960_000,
};

const TIPPER: ReportUsageSheet = {
  ...JCB,
  date: "2026-09-02",
  number: "EU/2",
  equipmentId: "tipper",
  equipment: "Tipper",
  equipmentNumber: "TN-02-CD-5678",
  basis: "trip",
  usage: 6,
  idleHours: 1,
  breakdownHours: 2.25,
  fuelQty: 20,
  fuelOverrun: true,
  approval: "pending",
  hireBasis: "trip",
  unitRate: 50_000,
  billableQty: 6,
  hireCost: 300_000,
};

describe("equipment usage reports", () => {
  it("owned: no hire columns; usage totalled only in one unit", () => {
    const body = buildEquipmentUsageReport({
      ownership: "owned",
      sheets: [TIPPER, JCB],
      financial: true,
      filters: { equipment: null },
    });
    expect(body.title).toBe("Company Owned Equipment Usage Report");
    const [sheets, byEquipment] = body.tables;
    expect(labels(sheets)).not.toContain("Hire cost");
    expect(labels(sheets)).not.toContain("Hire party");
    expect(cell(sheets, 0, "Number")).toBe("EU/1");
    expect(cell(sheets, 0, "Unit")).toBe("hrs");
    expect(cell(sheets, 1, "Unit")).toBe("trips");
    expect(cell(sheets, 1, "Fuel overrun")).toBe("Yes");
    expect(cell(sheets, 1, "Approval")).toBe("Pending");
    // Hours and trips do not add up.
    expect(total(sheets, "Usage")).toBeNull();
    expect(total(sheets, "Idle hrs")).toBe(1.5);
    expect(total(sheets, "Breakdown hrs")).toBe(2.25);
    expect(total(sheets, "Fuel")).toBe(60.25);
    expect(total(sheets, "Fuel overrun")).toBe("1");
    expect(byEquipment?.rows.map((row) => row.slice(0, 5))).toEqual([
      ["JCB 3DX", "TN-01-AB-1234", 1, 7.5, "hrs"],
      ["Tipper", "TN-02-CD-5678", 1, 6, "trips"],
    ]);
  });

  it("rented with Financial: hire party, basis, rate and cost with a total", () => {
    const body = buildEquipmentUsageReport({
      ownership: "rented",
      sheets: [JCB, { ...JCB, number: "EU/3", date: "2026-09-03", usage: 2 }],
      financial: true,
      filters: { equipment: "JCB 3DX (TN-01-AB-1234)" },
    });
    const [sheets, byEquipment] = body.tables;
    expect(labels(sheets).slice(-5)).toEqual([
      "Hire party",
      "Hire basis",
      "Billable qty",
      "Unit rate",
      "Hire cost",
    ]);
    expect(cell(sheets, 0, "Hire basis")).toBe("Hourly");
    expect(cell(sheets, 0, "Hire cost")).toBe(960_000);
    expect(total(sheets, "Usage")).toBe(9.5);
    expect(total(sheets, "Hire cost")).toBe(1_920_000);
    expect(total(sheets, "Unit rate")).toBeNull();
    expect(total(sheets, "Billable qty")).toBeNull();
    expect(cell(byEquipment, 0, "Hire cost")).toBe(1_920_000);
    expect(body.notes[0]).toBe("Equipment: JCB 3DX (TN-01-AB-1234)");
  });

  it("rented without Financial leaves the rate and cost out and says so", () => {
    const body = buildEquipmentUsageReport({
      ownership: "rented",
      sheets: [JCB],
      financial: false,
      filters: { equipment: null },
    });
    expect(labels(body.tables[0])).toContain("Hire party");
    expect(labels(body.tables[0])).toContain("Billable qty");
    expect(labels(body.tables[0])).not.toContain("Hire cost");
    expect(labels(body.tables[0])).not.toContain("Unit rate");
    expect(labels(body.tables[1])).not.toContain("Hire cost");
    expect(body.notes.join(" ")).toContain("need Financial on Equipment Usage");
  });
});

const SERVICE: ReportMaintenanceEntry = {
  equipment: "JCB 3DX",
  equipmentNumber: "TN-01",
  kind: "service",
  startDate: "2026-09-03",
  endDate: "2026-09-05",
  workshop: "Sri Balaji Motors",
  description: "Oil change",
  cost: 450_000,
  projectName: "Tower A",
};

describe("equipment maintenance and transfer reports", () => {
  it("counts days with both ends and an open entry to the period's end", () => {
    expect(maintenanceDays(SERVICE, "2026-09-30")).toBe(3);
    expect(
      maintenanceDays({ startDate: "2026-09-28", endDate: null }, "2026-09-30"),
    ).toBe(3);
  });

  it("central: a Project column, In maintenance for open entries, cost with Financial", () => {
    const body = buildEquipmentMaintenanceReport({
      range: { from: "2026-09-01", to: "2026-09-30" },
      entries: [
        {
          ...SERVICE,
          startDate: "2026-09-20",
          endDate: null,
          projectName: null,
          cost: 100_000,
        },
        SERVICE,
      ],
      financial: true,
      central: true,
    });
    const [table] = body.tables;
    expect(labels(table)).toEqual([
      "Equipment",
      "Equipment No.",
      "Project",
      "Kind",
      "Start",
      "End",
      "Days",
      "Workshop",
      "Description",
      "Cost",
    ]);
    expect(cell(table, 0, "Project")).toBe("Tower A");
    expect(cell(table, 0, "Kind")).toBe("Service");
    expect(cell(table, 1, "Project")).toBe("Warehouse / off system");
    expect(cell(table, 1, "End")).toBe("In maintenance");
    expect(cell(table, 1, "Days")).toBe(11);
    expect(total(table, "Days")).toBe(14);
    expect(total(table, "Cost")).toBe(550_000);
  });

  it("from a Project without Financial: no Project or Cost column", () => {
    const body = buildEquipmentMaintenanceReport({
      range: { from: "2026-09-01", to: "2026-09-30" },
      entries: [SERVICE],
      financial: false,
      central: false,
    });
    expect(labels(body.tables[0])).not.toContain("Project");
    expect(labels(body.tables[0])).not.toContain("Cost");
    expect(body.notes.join(" ")).toContain("need Financial on Equipments");
  });

  it("transfers print the Transfer Report columns", () => {
    const body = buildEquipmentTransferReport({
      central: true,
      transfers: [
        {
          equipment: "JCB 3DX",
          equipmentNumber: "TN-01",
          purchaseYear: 2020,
          date: "2026-09-10",
          before: { projectName: "Tower A", locationName: "Site yard" },
          toProject: null,
          locationName: "Ambattur yard",
          remark: "Monsoon break",
          entryBy: "Arun Selva Kumar",
        },
        {
          equipment: "Mixer",
          equipmentNumber: "MX-1",
          purchaseYear: null,
          date: "2026-09-02",
          before: null,
          toProject: "Villa B",
          locationName: "Gate 2",
          remark: null,
          entryBy: null,
        },
      ],
    });
    const [table] = body.tables;
    expect(labels(table)).toEqual([
      "Equipment Name",
      "Number",
      "Purchase Year",
      "Transfer Date",
      "Location Before",
      "Transfer To Project",
      "Latest Location",
      "Remarks",
      "Entry By",
    ]);
    expect(table?.rows[0]).toEqual([
      "Mixer",
      "MX-1",
      null,
      "02 Sep 2026",
      null,
      "Villa B",
      "Gate 2",
      null,
      null,
    ]);
    expect(cell(table, 1, "Location Before")).toBe("Tower A · Site yard");
    expect(cell(table, 1, "Transfer To Project")).toBe(
      "Warehouse / off system",
    );
    expect(cell(table, 1, "Purchase Year")).toBe("2020");
  });
});

describe("site-work report jobs", () => {
  it("checks the period and names the file", () => {
    expect(() =>
      checkReportParams({
        kind: "daily_work",
        from: "2026-09-30",
        to: "2026-09-01",
        contractorId: null,
      }),
    ).toThrow(DomainError);
    expect(
      reportFileName({
        kind: "rented_equipment_usage",
        from: "2026-09-01",
        to: "2026-09-30",
        equipmentId: null,
      }),
    ).toBe("rented-equipment-usage-2026-09-01-to-2026-09-30");
  });

  it("only the equipment lifecycle reports can be central among site-work kinds", () => {
    expect(canBeCentral("equipment_maintenance")).toBe(true);
    expect(canBeCentral("equipment_transfers")).toBe(true);
    expect(() => {
      checkReportScope("equipment_transfers", null);
    }).not.toThrow();
    for (const kind of [
      "daily_work",
      "owned_equipment_usage",
      "rented_equipment_usage",
    ] as const)
      expect(() => {
        checkReportScope(kind, null);
      }).toThrow(DomainError);
  });

  it("prints amounts only for the rented usage and maintenance reports", () => {
    expect(printsAmounts("rented_equipment_usage")).toBe(true);
    expect(printsAmounts("equipment_maintenance")).toBe(true);
    expect(printsAmounts("daily_work")).toBe(false);
    expect(printsAmounts("owned_equipment_usage")).toBe(false);
    expect(printsAmounts("equipment_transfers")).toBe(false);
    expect(printsAmounts("labour_attendance")).toBe(false);
    expect(printsAmounts("labour_month")).toBe(true);
  });
});
