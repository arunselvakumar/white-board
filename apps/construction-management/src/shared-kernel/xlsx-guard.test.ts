import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";

import {
  inflatesWithin,
  xlsxUnpacksWithin,
  zipUnpackedBytes,
} from "./xlsx-guard";

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

  it("refuses a workbook whose entry count was changed to hide entries", async () => {
    const bytes = await workbook(10);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    let eocd = bytes.byteLength - 22;
    while (eocd > 0 && view.getUint32(eocd, true) !== 0x06054b50) eocd -= 1;
    const doctored = bytes.slice();
    const edit = new DataView(doctored.buffer);
    edit.setUint16(eocd + 8, 0, true);
    edit.setUint16(eocd + 10, 0, true);
    expect(zipUnpackedBytes(doctored)).toBeNull();
    expect(xlsxUnpacksWithin(doctored)).toBe(false);
  });

  it("counts what really inflates when the declared sizes are falsified", async () => {
    const bytes = await workbook(2_000, "a".repeat(200));
    const doctored = bytes.slice();
    const view = new DataView(doctored.buffer);
    let eocd = doctored.byteLength - 22;
    while (eocd > 0 && view.getUint32(eocd, true) !== 0x06054b50) eocd -= 1;
    const entries = view.getUint16(eocd + 10, true);
    let at = view.getUint32(eocd + 16, true);
    for (let i = 0; i < entries; i += 1) {
      view.setUint32(at + 24, 1, true);
      at +=
        46 +
        view.getUint16(at + 28, true) +
        view.getUint16(at + 30, true) +
        view.getUint16(at + 32, true);
    }
    expect(zipUnpackedBytes(doctored)).toBe(entries);
    expect(inflatesWithin(doctored, 100_000)).toBe(false);
    expect(xlsxUnpacksWithin(doctored, 100_000)).toBe(false);
  });

  it("lets a real workbook inflate within the limit", async () => {
    const bytes = await workbook(50);
    expect(inflatesWithin(bytes, 5_000_000)).toBe(true);
  });

  it("refuses bytes that are not a ZIP", () => {
    expect(
      zipUnpackedBytes(new Uint8Array([0x50, 0x4b, 3, 4, 0, 0])),
    ).toBeNull();
    expect(xlsxUnpacksWithin(new Uint8Array(30))).toBe(false);
  });
});
