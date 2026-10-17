import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";

import { xlsxUnpacksWithin, zipUnpackedBytes } from "./xlsx-guard";

async function workbook(rows: number, text = "x"): Promise<Uint8Array> {
  const book = new ExcelJS.Workbook();
  const sheet = book.addWorksheet("Sheet");
  for (let i = 0; i < rows; i += 1) sheet.addRow([text, i]);
  return new Uint8Array(await book.xlsx.writeBuffer());
}

describe("xlsx expansion guard (review of #92, CWE-409)", () => {
  it("reads the unpacked size of a real workbook from its central directory", async () => {
    const bytes = await workbook(10);
    const total = zipUnpackedBytes(bytes);
    expect(total).toBeGreaterThan(bytes.byteLength);
    expect(xlsxUnpacksWithin(bytes)).toBe(true);
  });

  it("refuses a workbook that unpacks past the limit", async () => {
    const bytes = await workbook(2_000, "a".repeat(200));
    expect(bytes.byteLength).toBeLessThan(200_000);
    expect(xlsxUnpacksWithin(bytes, 100_000)).toBe(false);
  });

  it("refuses bytes that are not a ZIP", () => {
    expect(
      zipUnpackedBytes(new Uint8Array([0x50, 0x4b, 3, 4, 0, 0])),
    ).toBeNull();
    expect(xlsxUnpacksWithin(new Uint8Array(30))).toBe(false);
  });
});
