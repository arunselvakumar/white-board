import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";

import { readLabourSheet } from "./labour-workbook";

async function sheetWith(headers: string[], row: (string | null)[]) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Labours");
  sheet.addRow(headers);
  sheet.addRow(row);
  return new Uint8Array(await workbook.xlsx.writeBuffer());
}

describe("readLabourSheet", () => {
  it("reads the Site Engineer column", async () => {
    const rows = await readLabourSheet(
      await sheetWith(["Labour Name*", "Site Engineer"], ["Murugan", "Ganesh"]),
    );
    expect(rows).toEqual([
      { row: 2, cells: { name: "Murugan", supervisor: "Ganesh" } },
    ]);
  });

  it("still reads a template from before ADR CM-0036, where the column says Supervisor", async () => {
    const rows = await readLabourSheet(
      await sheetWith(["Labour Name*", "Supervisor"], ["Murugan", "Ganesh"]),
    );
    expect(rows).toEqual([
      { row: 2, cells: { name: "Murugan", supervisor: "Ganesh" } },
    ]);
  });
});
