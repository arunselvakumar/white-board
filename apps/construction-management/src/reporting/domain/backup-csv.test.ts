import { describe, expect, it } from "vitest";

import {
  BackupEntityWriter,
  csvCell,
  csvField,
  csvRow,
  enumLabel,
  jsonCell,
  rupeesFromPaise,
  type BackupColumn,
} from "./backup-csv";

const COLUMNS: BackupColumn[] = [
  { field: "number", label: "Worksheet No.", type: "text" },
  { field: "sheetDate", label: "Date", type: "date" },
  { field: "approvalStatus", label: "Approval", type: "enum" },
  { field: "hireCost", label: "Hire Cost (₹)", type: "money" },
  { field: "fuelOverrun", label: "Fuel Overrun", type: "bool" },
  { field: "siteLocation", label: "Location", type: "json" },
];

describe("the backup CSV writer (CM-906)", () => {
  it("prints paise as rupees with two decimals, bigint- and sign-safe", () => {
    expect(rupeesFromPaise(1_200_050n)).toBe("12000.50");
    expect(rupeesFromPaise(5)).toBe("0.05");
    expect(rupeesFromPaise(0)).toBe("0.00");
    expect(rupeesFromPaise(-12_345)).toBe("-123.45");
    expect(rupeesFromPaise(9_007_199_254_740_993n)).toBe("90071992547409.93");
  });

  it("quotes commas, quotes and line breaks, and doubles quotes (RFC 4180)", () => {
    expect(csvField("plain")).toBe("plain");
    expect(csvField("Slab, first floor")).toBe('"Slab, first floor"');
    expect(csvField('6" pipe')).toBe('"6"" pipe"');
    expect(csvField("two\nlines")).toBe('"two\nlines"');
    expect(csvField(" padded")).toBe('" padded"');
  });

  it("defuses text that a spreadsheet would run as a formula, but not numbers", () => {
    expect(csvField("=HYPERLINK(1)")).toBe("'=HYPERLINK(1)");
    expect(csvField("+91 98400 12345")).toBe("'+91 98400 12345");
    expect(csvField("-12.50", "money")).toBe("-12.50");
  });

  it("formats cells as the screens show them and JSON as raw fields", () => {
    const date = new Date("2026-09-12T00:00:00.000Z");
    expect(csvCell("date", date)).toBe("2026-09-12");
    expect(csvCell("enum", "not_required")).toBe("Not required");
    expect(csvCell("bool", true)).toBe("Yes");
    expect(csvCell("money", null)).toBe("");
    expect(csvCell("json", { type: "location", locationId: "l1" })).toBe(
      '{"type":"location","locationId":"l1"}',
    );
    expect(jsonCell("date", date)).toBe("2026-09-12");
    expect(jsonCell("enum", "not_required")).toBe("not_required");
    expect(jsonCell("money", 150_000n)).toBe("1500.00");
    expect(jsonCell("number", 4n)).toBe(4);
    expect(jsonCell("bool", false)).toBe(false);
    expect(enumLabel("shift_1")).toBe("Shift 1");
  });

  it("writes a header of labels then one line per row, with a BOM and CRLF", () => {
    const writer = new BackupEntityWriter(COLUMNS);
    writer.add([
      {
        number: "WS/0001",
        sheetDate: new Date("2026-09-12T00:00:00.000Z"),
        approvalStatus: "pending",
        hireCost: 1_200_050n,
        fuelOverrun: false,
        siteLocation: null,
      },
    ]);
    const files = writer.finish();
    expect(writer.rows).toBe(1);
    expect(files.csv).toBe(
      "\uFEFFWorksheet No.,Date,Approval,Hire Cost (₹),Fuel Overrun,Location\r\n" +
        "WS/0001,2026-09-12,Pending,12000.50,No,\r\n",
    );
    expect(JSON.parse(files.json)).toEqual([
      {
        number: "WS/0001",
        sheetDate: "2026-09-12",
        approvalStatus: "pending",
        hireCost: "12000.50",
        fuelOverrun: false,
        siteLocation: null,
      },
    ]);
    expect(new BackupEntityWriter(COLUMNS).finish().json).toBe("[]\n");
    expect(csvRow(COLUMNS.slice(0, 1), { number: "A,B" })).toBe('"A,B"\r\n');
  });
});
