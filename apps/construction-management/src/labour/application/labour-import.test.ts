import { describe, expect, it } from "vitest";

import { DomainError } from "@/src/shared-kernel/domain-error";

import type { LabourSheetRow } from "./labour-columns";
import { FakeLabourRepository } from "./labour-fakes";
import {
  LabourImport,
  sheetDate,
  sheetMoney,
  sheetWeekdays,
} from "./labour-import";
import type { LabourLookups } from "./labour-ports";

const LOOKUPS: LabourLookups = {
  all: () =>
    Promise.resolve({
      projects: [{ id: "p1", name: "Tower A" }],
      labourCategories: [
        { id: "c1", name: "Mason", disabled: false },
        { id: "c2", name: "Welder", disabled: true },
      ],
      supervisors: [{ id: "s1", name: "Sunil", disabled: false }],
    }),
};

function row(number: number, cells: LabourSheetRow["cells"]): LabourSheetRow {
  return {
    row: number,
    cells: {
      name: "Ganesh",
      joiningDate: "2026-09-01",
      wageType: "Daily wages",
      wagePerDay: 650,
      overtimeWagePerHour: "80.50",
      project: "tower a",
      ...cells,
    },
  };
}

describe("sheet cells", () => {
  it("reads dates in ISO and Indian forms", () => {
    expect(sheetDate(new Date("2026-09-01T00:00:00Z"))).toBe("2026-09-01");
    expect(sheetDate("1/9/2026")).toBe("2026-09-01");
    expect(sheetDate("31-02-2026")).toBeNull();
  });

  it("reads rupees as paise", () => {
    expect(sheetMoney(700)).toBe(70_000);
    expect(sheetMoney("₹1,200.50")).toBe(1_20_050);
    expect(sheetMoney("-1500")).toBe(-1_50_000);
    expect(sheetMoney(null)).toBeNull();
    expect(sheetMoney("abc")).toBeUndefined();
    expect(sheetMoney("1.234")).toBeUndefined();
  });

  it("reads weekday names", () => {
    expect(sheetWeekdays("Sun, Saturday")).toEqual([0, 6]);
    expect(sheetWeekdays("")).toEqual([]);
    expect(sheetWeekdays("Funday")).toBeUndefined();
  });
});

describe("LabourImport", () => {
  it("previews every row with its errors and matches names case-insensitively", async () => {
    const importer = new LabourImport(new FakeLabourRepository(), LOOKUPS);
    const preview = await importer.preview("w1", [
      row(2, {
        labourCategory: "MASON",
        supervisor: "sunil",
        labourCode: "X1",
      }),
      row(3, {
        name: "",
        wagePerDay: "abc",
        project: "Nowhere",
        labourCategory: "Welder",
        labourCode: "x1",
      }),
    ]);
    expect(preview).toMatchObject({ valid: 0, invalid: 2 });
    expect(preview.rows[0]?.errors.map((error) => error.code)).toEqual([
      "LABOUR_CODE_DUPLICATE",
    ]);
    expect(preview.rows[1]?.errors.map((error) => error.code).sort()).toEqual([
      "AMOUNT_INVALID",
      "LABOUR_CATEGORY_NOT_FOUND",
      "LABOUR_CODE_DUPLICATE",
      "LABOUR_NAME_REQUIRED",
      "PROJECT_NOT_FOUND",
    ]);
  });

  it("commits all rows or none", async () => {
    const repository = new FakeLabourRepository();
    const importer = new LabourImport(repository, LOOKUPS);
    let refused: unknown;
    try {
      await importer.commit({
        workspaceId: "w1",
        sheet: [row(2, {}), row(3, { project: "" })],
        by: "u1",
      });
    } catch (error) {
      refused = error;
    }
    expect(refused).toBeInstanceOf(DomainError);
    expect((refused as DomainError).code).toBe("IMPORT_HAS_ERRORS");
    expect(repository.labours.size).toBe(0);

    const result = await importer.commit({
      workspaceId: "w1",
      sheet: [row(2, { openingBalance: -100 }), row(3, { name: "Mahesh" })],
      by: "u1",
    });
    expect(result.imported).toBe(2);
    const [first] = [...repository.labours.values()];
    expect(first?.details).toMatchObject({
      wagePerDay: 65_000,
      overtimeWagePerHour: 8_050,
      wageType: "daily",
    });
    expect(first?.currentProjectId).toBe("p1");
    expect([...repository.ledger.values()]).toEqual([[-10_000], []]);
    expect(repository.audits.map((audit) => audit.action)).toEqual([
      "labour.imported",
    ]);
  });

  it("refuses an empty sheet and more than 1000 rows", async () => {
    const importer = new LabourImport(new FakeLabourRepository(), LOOKUPS);
    await expect(importer.preview("w1", [])).rejects.toMatchObject({
      code: "IMPORT_EMPTY",
    });
    const many = Array.from({ length: 1001 }, (_, index) => row(index + 2, {}));
    await expect(importer.preview("w1", many)).rejects.toMatchObject({
      code: "IMPORT_TOO_MANY_ROWS",
    });
  });
});
