import { describe, expect, it } from "vitest";

import { DomainError } from "@/src/shared-kernel/domain-error";

import type { EmployeeSheetRow } from "./employee-columns";
import { FakeEmployeeRepository } from "./employee-fakes";
import {
  EmployeeImport,
  sheetDate,
  sheetMoney,
  sheetWeekdays,
} from "./employee-import";
import type { EmployeeLookups } from "./employee-ports";

const HR = { id: "d-hr", name: "Human Resources" };
const SITE = { id: "d-site", name: "Site" };

const LOOKUPS: EmployeeLookups = {
  all: () =>
    Promise.resolve({
      projects: [
        { id: "p1", name: "Tower A" },
        { id: "p2", name: "Tower B" },
      ],
      labourCategories: [
        { id: "c1", name: "Mason", disabled: false },
        { id: "c2", name: "Welder", disabled: true },
      ],
      departments: [
        { id: "d-hr", name: "Human Resources" },
        { id: "d-site", name: "Site" },
      ],
      roles: [
        { id: "r-labour", name: "Labour", department: HR, isSeed: true },
        {
          id: "r-engineer",
          name: "Site Engineer",
          department: HR,
          isSeed: true,
        },
        { id: "r-lead", name: "Lead", department: HR, isSeed: false },
        { id: "r-lead-site", name: "Lead", department: SITE, isSeed: false },
      ],
    }),
};

function row(
  number: number,
  cells: EmployeeSheetRow["cells"],
): EmployeeSheetRow {
  return {
    row: number,
    cells: {
      name: "Ganesh",
      joiningDate: "2026-09-01",
      wageType: "Daily wages",
      wagePerDay: 650,
      overtimeWagePerHour: "80.50",
      projects: "tower a",
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

describe("EmployeeImport", () => {
  it("previews every row with its errors and matches names case-insensitively", async () => {
    const importer = new EmployeeImport(new FakeEmployeeRepository(), LOOKUPS);
    const preview = await importer.preview("w1", [
      row(2, {
        labourCategory: "MASON",
        employeeCode: "X1",
      }),
      row(3, {
        name: "",
        wagePerDay: "abc",
        projects: "Tower A; Nowhere",
        labourCategory: "Welder",
        employeeCode: "x1",
      }),
    ]);
    expect(preview).toMatchObject({ valid: 0, invalid: 2 });
    expect(preview.rows[0]?.errors.map((error) => error.code)).toEqual([
      "EMPLOYEE_CODE_DUPLICATE",
    ]);
    expect(preview.rows[1]?.errors.map((error) => error.code).sort()).toEqual([
      "AMOUNT_INVALID",
      "EMPLOYEE_CODE_DUPLICATE",
      "EMPLOYEE_NAME_REQUIRED",
      "LABOUR_CATEGORY_NOT_FOUND",
      "PROJECT_NOT_FOUND",
    ]);
  });

  it("commits all rows or none", async () => {
    const repository = new FakeEmployeeRepository();
    const importer = new EmployeeImport(repository, LOOKUPS);
    let refused: unknown;
    try {
      await importer.commit({
        workspaceId: "w1",
        sheet: [row(2, {}), row(3, { projects: "Nowhere" })],
        by: "u1",
      });
    } catch (error) {
      refused = error;
    }
    expect(refused).toBeInstanceOf(DomainError);
    expect((refused as DomainError).code).toBe("IMPORT_HAS_ERRORS");
    expect(repository.employees.size).toBe(0);

    const result = await importer.commit({
      workspaceId: "w1",
      sheet: [
        row(2, { openingBalance: -100 }),
        row(3, { name: "Manikandan", projects: "Tower B ; tower a;" }),
        row(4, { name: "Ravi", projects: null }),
      ],
      by: "u1",
    });
    expect(result.imported).toBe(3);
    const [first, second, third] = [...repository.employees.values()];
    expect(first?.details).toMatchObject({
      wagePerDay: 65_000,
      overtimeWagePerHour: 8_050,
      wageType: "daily",
    });
    expect(first?.projectIds).toEqual(["p1"]);
    // Many, separated by ";", or none (ADR CM-0033).
    expect(second?.projectIds).toEqual(["p2", "p1"]);
    expect(third?.projectIds).toEqual([]);
    expect([...repository.ledger.values()]).toEqual([[-10_000], [], []]);
    expect(repository.audits.map((audit) => audit.action)).toEqual([
      "employee.imported",
    ]);
  });

  it("finds the Role by name, under the Department; a blank Role is Labour", async () => {
    const repository = new FakeEmployeeRepository();
    const importer = new EmployeeImport(repository, LOOKUPS);
    const preview = await importer.preview("w1", [
      row(2, {}),
      row(3, { role: "site engineer" }),
      row(4, { role: "Lead" }),
      row(5, { role: "Lead", department: "site" }),
      row(6, { role: "Foreman" }),
      row(7, { department: "Nowhere" }),
      row(8, { department: "Site" }),
    ]);
    expect(preview.rows.map((item) => item.errors.map((e) => e.code))).toEqual([
      [],
      [],
      ["EMPLOYEE_ROLE_AMBIGUOUS"],
      [],
      ["EMPLOYEE_ROLE_NOT_FOUND"],
      ["DEPARTMENT_NOT_FOUND"],
      ["EMPLOYEE_ROLE_REQUIRED"],
    ]);
    await importer.commit({
      workspaceId: "w1",
      sheet: [
        row(2, {}),
        row(3, { name: "Meena", role: "Site Engineer", mobile: "7708165767" }),
        row(4, { name: "Kumar", role: "lead", department: "Site" }),
      ],
      by: "u1",
    });
    expect(
      [...repository.employees.values()].map((employee) => [
        employee.details.roleId,
        employee.details.mobile,
      ]),
    ).toEqual([
      ["r-labour", null],
      ["r-engineer", "+917708165767"],
      ["r-lead-site", null],
    ]);
  });

  it("reads working hours a day, 8 when the cell is blank", async () => {
    const repository = new FakeEmployeeRepository();
    const importer = new EmployeeImport(repository, LOOKUPS);
    const preview = await importer.preview("w1", [
      row(2, { workingHoursPerDay: "25" }),
    ]);
    expect(preview.rows[0]?.errors).toEqual([
      expect.objectContaining({
        field: "workingHoursPerDay",
        code: "WORKING_HOURS_INVALID",
      }),
    ]);
    await importer.commit({
      workspaceId: "w1",
      sheet: [row(2, { workingHoursPerDay: 9.5 }), row(3, { name: "Mani" })],
      by: "u1",
    });
    expect(
      [...repository.employees.values()].map(
        (employee) => employee.details.workingHoursPerDay,
      ),
    ).toEqual(["9.5", "8"]);
  });

  it("refuses an empty sheet and more than 1000 rows", async () => {
    const importer = new EmployeeImport(new FakeEmployeeRepository(), LOOKUPS);
    await expect(importer.preview("w1", [])).rejects.toMatchObject({
      code: "IMPORT_EMPTY",
    });
    const many = Array.from({ length: 1001 }, (_, index) => row(index + 2, {}));
    await expect(importer.preview("w1", many)).rejects.toMatchObject({
      code: "IMPORT_TOO_MANY_ROWS",
    });
  });
});
