import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";

import { readEmployeeSheet } from "./employee-workbook";

async function sheetWith(
  headers: string[],
  row: (string | null)[],
  name = "Employees",
) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(name);
  sheet.addRow(headers);
  sheet.addRow(row);
  return new Uint8Array(await workbook.xlsx.writeBuffer());
}

describe("readEmployeeSheet", () => {
  it("reads the Employee template's headers", async () => {
    const rows = await readEmployeeSheet(
      await sheetWith(
        ["Employee Name*", "Employee Id", "Department", "Role", "Mobile"],
        ["Murugan", "E-1", "Human Resources", "Site Engineer", "7708165767"],
      ),
    );
    expect(rows).toEqual([
      {
        row: 2,
        cells: {
          name: "Murugan",
          employeeCode: "E-1",
          department: "Human Resources",
          role: "Site Engineer",
          mobile: "7708165767",
        },
      },
    ]);
  });

  // Sheets made from the Labour template before ADR CM-0055 still import.
  it("reads a Labour sheet's Labour Id and Contact Number", async () => {
    const rows = await readEmployeeSheet(
      await sheetWith(
        ["Labour Name*", "Labour Id", "Contact Number"],
        ["Murugan", "L-1", "7708165767"],
        "Labours",
      ),
    );
    expect(rows).toEqual([
      {
        row: 2,
        cells: { name: "Murugan", employeeCode: "L-1", mobile: "7708165767" },
      },
    ]);
  });

  it.each(["Site Engineer", "Supervisor"])(
    "ignores a %s column from an older template",
    async (header) => {
      const rows = await readEmployeeSheet(
        await sheetWith(["Employee Name*", header], ["Murugan", "Ganesh"]),
      );
      expect(rows).toEqual([{ row: 2, cells: { name: "Murugan" } }]);
    },
  );
});
