import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";

import type { DomainError } from "@/src/shared-kernel/domain-error";

import {
  importedCompany,
  MAX_COMPANY_IMPORT_ROWS,
} from "../domain/company-import";
import {
  companyImportTemplate,
  readCompanySheet,
} from "./company-import-workbook";

async function sheetOf(
  rows: ExcelJS.CellValue[][],
  sheetName = "Sheet1",
): Promise<Uint8Array> {
  const book = new ExcelJS.Workbook();
  const sheet = book.addWorksheet(sheetName);
  for (const row of rows) sheet.addRow(row);
  return new Uint8Array(await book.xlsx.writeBuffer());
}

async function refusal(bytes: Uint8Array): Promise<DomainError> {
  try {
    await readCompanySheet(bytes);
  } catch (error) {
    return error as DomainError;
  }
  throw new Error("The sheet was read");
}

describe("Prospect Company import sheet (ADR CM-0040 §11)", () => {
  it("reads its own template back: the headers and the example row", async () => {
    const rows = await readCompanySheet(await companyImportTemplate());
    expect(rows).toEqual([
      {
        row: 2,
        cells: {
          name: "Anugraha Steel",
          city: "Coimbatore",
          phone: "0422 2345678",
          contactName: "Ravi Kumar",
          contactMobile: "98765 43210",
        },
      },
    ]);
  });

  it("finds the columns by header in any order, case and spacing, and ignores others", async () => {
    const rows = await readCompanySheet(
      await sheetOf([
        ["Notes", "primary contact MOBILE", " Company Name ", "city", "Mobile"],
        ["call later", "9876543210", "Kaveri Steel", "Salem", "9000000000"],
      ]),
    );
    expect(rows).toEqual([
      {
        row: 2,
        cells: {
          contactMobile: "9876543210",
          name: "Kaveri Steel",
          city: "Salem",
        },
      },
    ]);
  });

  it("skips blank rows and keeps each row's number in the sheet", async () => {
    const rows = await readCompanySheet(
      await sheetOf([
        ["Name", "City"],
        ["Kaveri Steel", "Salem"],
        [],
        ["   ", ""],
        ["Pandian Mills", null],
      ]),
    );
    expect(rows.map((row) => [row.row, row.cells.name])).toEqual([
      [2, "Kaveri Steel"],
      [5, "Pandian Mills"],
    ]);
  });

  it("reads a mobile typed as a number and normalises it to +91", async () => {
    const [row] = await readCompanySheet(
      await sheetOf([
        ["Name", "Primary Contact name", "Primary Contact mobile"],
        ["Kaveri Steel", "Lakshmi", 9840012345],
      ]),
    );
    expect(row?.cells.contactMobile).toBe("9840012345");
    expect(importedCompany(row?.cells ?? {}).contact).toMatchObject({
      name: "Lakshmi",
      mobile: "+919840012345",
    });
  });

  it("keeps a cell that shows an error as unreadable, not blank, and refuses the row", async () => {
    const rows = await readCompanySheet(
      await sheetOf([
        ["Name", "Phone", "City"],
        [
          "Kaveri Steel",
          { formula: "1/0", result: { error: "#DIV/0!" } },
          "Salem",
        ],
        [{ error: "#N/A" }],
        ["Pandian Mills", { formula: "A1" }, "Madurai"],
      ]),
    );
    expect(rows).toEqual([
      {
        row: 2,
        cells: { name: "Kaveri Steel", city: "Salem" },
        unreadable: [{ column: "phone", error: "#DIV/0!" }],
      },
      { row: 3, cells: {}, unreadable: [{ column: "name", error: "#N/A" }] },
      {
        row: 4,
        cells: { name: "Pandian Mills", city: "Madurai" },
        unreadable: [{ column: "phone", error: "a formula without a value" }],
      },
    ]);
    const [first] = rows;
    expect(() =>
      importedCompany(first?.cells ?? {}, first?.unreadable),
    ).toThrow("This cell shows #DIV/0!. Type the value in instead.");
  });

  it("reads a sheet whose merged range covers the whole sheet without building its cells", async () => {
    const book = new ExcelJS.Workbook();
    const sheet = book.addWorksheet("Sheet1");
    sheet.addRow(["Name"]);
    sheet.addRow(["Kaveri Steel"]);
    sheet.mergeCells("B3:C4");
    const bytes = new Uint8Array(await book.xlsx.writeBuffer());
    const { strFromU8, strToU8, unzipSync, zipSync } = await import("fflate");
    const entries = unzipSync(bytes);
    const name = "xl/worksheets/sheet1.xml";
    entries[name] = strToU8(
      strFromU8(entries[name] ?? new Uint8Array()).replace(
        /<mergeCell ref="[^"]+"\/>/,
        '<mergeCell ref="A5:XFD1048576"/>',
      ),
    );
    expect(strFromU8(entries[name] ?? new Uint8Array())).toContain(
      "A5:XFD1048576",
    );
    const rows = await readCompanySheet(zipSync(entries));
    expect(rows).toEqual([{ row: 2, cells: { name: "Kaveri Steel" } }]);
  });

  it("refuses a sheet without a Name header, a file that is not an .xlsx, and too many rows", async () => {
    await expect(
      refusal(await sheetOf([["City"], ["Salem"]])),
    ).resolves.toMatchObject({ code: "IMPORT_FILE_INVALID" });
    await expect(
      refusal(new TextEncoder().encode("Name,City\nKaveri,Salem")),
    ).resolves.toMatchObject({
      code: "IMPORT_FILE_INVALID",
      message: "Upload the Excel (.xlsx) template.",
    });
    const many = Array.from({ length: MAX_COMPANY_IMPORT_ROWS + 1 }, (_, i) => [
      `Company ${String(i)}`,
    ]);
    await expect(
      refusal(await sheetOf([["Name"], ...many])),
    ).resolves.toMatchObject({ code: "IMPORT_TOO_MANY" });
  });
});

describe("an imported row (PRD §3.3)", () => {
  const fieldOf = (cells: Parameters<typeof importedCompany>[0]) => {
    try {
      importedCompany(cells);
    } catch (error) {
      return (error as DomainError & { details: { field: string } }).details
        .field;
    }
    return null;
  };

  it("tidies the name and keeps the row without a Contact", () => {
    expect(importedCompany({ name: "  Kaveri   Steel " })).toEqual({
      details: expect.objectContaining({
        name: "Kaveri Steel",
        city: null,
        phone: null,
        source: null,
      }) as unknown,
      contact: null,
    });
  });

  it("names the column of the first problem", () => {
    expect(fieldOf({ city: "Salem" })).toBe("name");
    expect(fieldOf({ name: "Kaveri", phone: "call me" })).toBe("phone");
    expect(fieldOf({ name: "Kaveri", contactMobile: "98765" })).toBe(
      "contactMobile",
    );
    expect(fieldOf({ name: "Kaveri", contactMobile: "9876543210" })).toBe(
      "contactName",
    );
    expect(fieldOf({ name: "Kaveri", contactName: "Ravi" })).toBeNull();
  });
});
