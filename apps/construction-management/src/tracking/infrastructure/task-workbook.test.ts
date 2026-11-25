import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";

import { TASK_IMPORT_COLUMNS } from "../application/task-import";
import { readTaskSheet, taskImportSample } from "./task-workbook";

async function workbook(rows: (string | number | null)[][]) {
  const book = new ExcelJS.Workbook();
  const sheet = book.addWorksheet("Tasks");
  for (const row of rows) sheet.addRow(row);
  const written = (await book.xlsx.writeBuffer()) as unknown as Uint8Array;
  return Uint8Array.from(written);
}

describe("task import workbook", () => {
  it("has no Department column in the sample", async () => {
    expect(TASK_IMPORT_COLUMNS.map((column) => column.header)).not.toContain(
      "Department",
    );
    const rows = await readTaskSheet(
      await taskImportSample({ memberName: "Ravi", unitName: "Cum" }),
    );
    expect(rows[1]?.cells).toMatchObject({
      name: "Ground floor columns",
      assignees: "Ravi",
      tags: "Structure",
      totalWork: 48,
      unit: "Cum",
    });
  });

  it("ignores the Department column of a workbook from before (ADR CM-0048)", async () => {
    const rows = await readTaskSheet(
      await workbook([
        ["Ref", "Task Name*", "Assignees", "Department", "Contractor", "Tags"],
        ["1", "Ground floor columns", "Ravi", "RCC", "Velan", "Structure"],
      ]),
    );
    expect(rows).toEqual([
      {
        row: 2,
        cells: {
          ref: "1",
          name: "Ground floor columns",
          assignees: "Ravi",
          contractor: "Velan",
          tags: "Structure",
        },
      },
    ]);
  });
});
