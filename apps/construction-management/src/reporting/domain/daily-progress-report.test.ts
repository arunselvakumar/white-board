import { describe, expect, it } from "vitest";

import {
  buildDailyProgressReport,
  dprMoney,
  labourByContractor,
  NONE_RECORDED,
  utilisation,
  type DprBlock,
  type DprDocument,
} from "./daily-progress-report";
import {
  dprEquipment,
  dprReadModel,
  dprWorksheet,
} from "./daily-progress-report-fixtures";

function section(document: DprDocument, title: string) {
  const found = document.sections.find((item) => item.title === title);
  if (found == null) throw new Error(`No section ${title}`);
  return found;
}

function table(block: DprBlock | undefined) {
  if (block?.type !== "table") throw new Error("Not a table");
  return block;
}

describe("buildDailyProgressReport", () => {
  it("lays the day out in the ADR's order, with the header facts", () => {
    const document = buildDailyProgressReport(
      dprReadModel({ includeImages: true, filledBy: "Priya" }),
    );
    expect(document.sections.map((item) => item.title)).toEqual([
      "Weather and site condition",
      "Labour",
      "Worksheets",
      "Equipment usage",
      "Materials",
      "Visitors",
      "Instructions",
      "Hindrances",
      "Notes",
      "Photos",
    ]);
    expect(document.header).toMatchObject({
      company: "Anugraha Engineers",
      project: "Tower A",
      number: "DPR/26-27/00001",
      date: "08 Oct 2026",
      filledBy: "Priya",
    });
  });

  it("leaves Photos out unless Include images was ticked", () => {
    const document = buildDailyProgressReport(dprReadModel());
    expect(document.sections.map((item) => item.title)).not.toContain("Photos");
    expect(document.header.filledBy).toBe("All Team Members");
  });

  it("prints None recorded. for every empty section instead of dropping it", () => {
    const document = buildDailyProgressReport(
      dprReadModel({
        diary: null,
        worksheets: [],
        equipment: [],
        received: [],
        consumed: [],
        hindrances: [],
        includeImages: true,
        attendance: {
          labourPresent: { skilled: 0, unskilled: 0 },
          labourHalfDay: { skilled: 0, unskilled: 0 },
          vendorFullDay: { skilled: 0, unskilled: 0 },
          vendorHalfDay: { skilled: 0, unskilled: 0 },
        },
      }),
    );
    for (const item of document.sections) {
      const texts = item.blocks.map((block) =>
        block.type === "text" ? block.text : block.type,
      );
      expect(
        texts.every((value) => value.endsWith(NONE_RECORDED)),
        item.title,
      ).toBe(true);
    }
  });

  it("sums labour per Contractor and Department and shows attendance against the worksheets", () => {
    const worksheets = [
      dprWorksheet(),
      dprWorksheet({ id: "ws-2", skilled: 1, unskilled: null }),
      dprWorksheet({
        id: "ws-3",
        contractor: "Annai Electricals",
        department: "Electrical",
        skilled: 2,
        unskilled: 0,
      }),
    ];
    expect(labourByContractor(worksheets)).toEqual([
      {
        contractor: "Annai Electricals",
        department: "Electrical",
        heads: { skilled: 2, unskilled: 0 },
      },
      {
        contractor: "Sri Balaji Builders",
        department: "RCC",
        heads: { skilled: 5, unskilled: 6 },
      },
    ]);
    const labour = section(
      buildDailyProgressReport(dprReadModel({ worksheets })),
      "Labour",
    );
    const byContractor = table(labour.blocks[0]);
    expect(byContractor.totals).toEqual(["Total", "", "7", "6", "13"]);
    const attendance = table(labour.blocks[1]);
    // Attendance: 3+0+2+0 skilled, 5+1+2+0 unskilled.
    expect(attendance.rows.at(-2)).toEqual(["Attendance", "5", "8", "13"]);
    expect(attendance.rows.at(-1)).toEqual(["On worksheets", "7", "6", "13"]);
    expect(attendance.totals).toEqual(["Difference", "-2", "2", "0"]);
  });

  it("notes that Filled By limits the worksheets but not attendance", () => {
    const labour = section(
      buildDailyProgressReport(dprReadModel({ filledBy: "Priya" })),
      "Labour",
    );
    expect(labour.blocks.at(-1)).toEqual({
      type: "text",
      muted: true,
      text: "Worksheets filled by Priya only; attendance is the whole Project's.",
    });
  });

  it("prints worksheets with their approval note, work done and materials", () => {
    const worksheets = section(
      buildDailyProgressReport(
        dprReadModel({
          worksheets: [dprWorksheet({ approvalStatus: "rejected" })],
        }),
      ),
      "Worksheets",
    );
    const row = table(worksheets.blocks[0]).rows[0];
    expect(row).toEqual([
      "WS/26-27/00001\nShift 1\nRejected",
      "Sri Balaji Builders\nRCC",
      "Slab casting",
      "Wing A · Floor 3",
      "4",
      "6",
      "12.5 Cum",
      "Cement OPC 53: 10 Bag",
      "—",
    ]);
  });

  it("prints hire cost only with money", () => {
    const withMoney = table(
      section(buildDailyProgressReport(dprReadModel()), "Equipment usage")
        .blocks[0],
    );
    expect(withMoney.columns.at(-1)?.label).toBe("Hire cost");
    expect(withMoney.rows[0]?.at(-1)).toBe("6,500.00");
    expect(withMoney.totals?.at(-1)).toBe("6,500.00");

    const without = table(
      section(
        buildDailyProgressReport(dprReadModel({ money: false })),
        "Equipment usage",
      ).blocks[0],
    );
    expect(without.columns.map((column) => column.label)).not.toContain(
      "Hire cost",
    );
    expect(without.totals).toBeUndefined();
    expect(JSON.stringify(without)).not.toContain("6,500");
  });

  it("totals hire cost only when the day has rented sheets", () => {
    const ownedOnly = table(
      section(
        buildDailyProgressReport(
          dprReadModel({ equipment: [dprEquipment({ hireCost: null })] }),
        ),
        "Equipment usage",
      ).blocks[0],
    );
    expect(ownedOnly.rows[0]?.at(-1)).toBe("—");
    expect(ownedOnly.totals).toBeUndefined();
  });

  it("reads utilisation by the basis, with the meter", () => {
    expect(utilisation(dprEquipment())).toBe("6.5 h\nMeter 1200 to 1206.5");
    expect(
      utilisation(
        dprEquipment({
          basis: "trip",
          trips: 1,
          openingReading: null,
          closingReading: null,
        }),
      ),
    ).toBe("1 trip");
    expect(
      utilisation(
        dprEquipment({
          basis: "km",
          distanceKm: "42.00",
          openingReading: null,
        }),
      ),
    ).toBe("42 km");
  });

  it("counts photos left out over the limit", () => {
    const photos = section(
      buildDailyProgressReport(
        dprReadModel({
          includeImages: true,
          photos: [
            { key: "k", contentType: "image/webp", caption: "Site Diary" },
          ],
          photosLeftOut: 3,
        }),
      ),
      "Photos",
    );
    expect(photos.blocks[0]?.type).toBe("photos");
    expect(photos.blocks[1]).toMatchObject({
      text: "3 more images were not printed: a report prints at most 60.",
    });
  });

  it("formats paise with Indian grouping", () => {
    expect(dprMoney(12_345_678n)).toBe("1,23,456.78");
    expect(dprMoney(5n)).toBe("0.05");
  });
});
