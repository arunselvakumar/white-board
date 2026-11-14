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
  // A Labour's Site Engineers come from their Projects (ADR CM-0041), so
  // older templates import with that column ignored.
  it.each(["Site Engineer", "Supervisor"])(
    "ignores a %s column from an older template",
    async (header) => {
      const rows = await readLabourSheet(
        await sheetWith(["Labour Name*", header], ["Murugan", "Ganesh"]),
      );
      expect(rows).toEqual([{ row: 2, cells: { name: "Murugan" } }]);
    },
  );
});
