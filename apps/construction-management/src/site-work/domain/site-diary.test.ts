import { describe, expect, it } from "vitest";

import { DomainError } from "@/src/shared-kernel/domain-error";

import {
  siteDiaryContent,
  siteDiaryInstructions,
  siteDiaryVisitors,
  SITE_DIARY_LIMITS,
} from "./site-diary";

const TODAY = "2026-10-11";

function refusal(fn: () => unknown): { code: string; field: unknown } {
  try {
    fn();
  } catch (error) {
    if (error instanceof DomainError)
      return {
        code: error.code,
        field: (error.details as { field?: unknown } | undefined)?.field,
      };
    throw error;
  }
  throw new Error("expected a DomainError");
}

describe("siteDiaryContent", () => {
  it("normalises a full diary", () => {
    const content = siteDiaryContent(
      {
        diaryDate: "2026-10-10",
        weatherMorning: "sunny",
        weatherAfternoon: "light_rain",
        rainfallMm: "012.50",
        siteCondition: "  Slushy near the ramp ",
        notes: "",
        visitors: [
          {
            name: " Ravi ",
            organisation: "Client",
            purpose: "",
            timeIn: "10:00",
            timeOut: "11:30",
          },
        ],
        instructions: [
          {
            givenBy: "Architect",
            givenTo: null,
            instruction: "Hold the slab pour",
            actionTaken: "",
          },
        ],
      },
      TODAY,
    );
    expect(content).toEqual({
      diaryDate: "2026-10-10",
      weatherMorning: "sunny",
      weatherAfternoon: "light_rain",
      rainfallMm: "12.5",
      siteCondition: "Slushy near the ramp",
      notes: null,
      visitors: [
        {
          name: "Ravi",
          organisation: "Client",
          purpose: null,
          timeIn: "10:00",
          timeOut: "11:30",
        },
      ],
      instructions: [
        {
          givenBy: "Architect",
          givenTo: null,
          instruction: "Hold the slab pour",
          actionTaken: null,
        },
      ],
    });
  });

  it("takes rainfall as a number and keeps zero", () => {
    expect(
      siteDiaryContent({ diaryDate: TODAY, rainfallMm: 0 }, TODAY).rainfallMm,
    ).toBe("0");
    expect(
      siteDiaryContent({ diaryDate: TODAY, rainfallMm: 3.4 }, TODAY).rainfallMm,
    ).toBe("3.4");
    expect(
      siteDiaryContent({ diaryDate: TODAY, rainfallMm: "" }, TODAY).rainfallMm,
    ).toBeNull();
  });

  it("refuses a future date, bad rainfall and long text", () => {
    expect(
      refusal(() => siteDiaryContent({ diaryDate: "2026-10-12" }, TODAY)),
    ).toEqual({
      code: "SITE_DIARY_DATE_IN_FUTURE",
      field: "diaryDate",
    });
    expect(
      refusal(() => siteDiaryContent({ diaryDate: "2026-02-30" }, TODAY)).code,
    ).toBe("SITE_DIARY_DATE_INVALID");
    for (const rainfallMm of ["-1", "1.25", "abc", "10000"])
      expect(
        refusal(() =>
          siteDiaryContent({ diaryDate: TODAY, rainfallMm }, TODAY),
        ),
      ).toEqual({ code: "SITE_DIARY_RAINFALL_INVALID", field: "rainfallMm" });
    expect(
      refusal(() =>
        siteDiaryContent(
          { diaryDate: TODAY, notes: "x".repeat(SITE_DIARY_LIMITS.notes + 1) },
          TODAY,
        ),
      ),
    ).toEqual({ code: "TEXT_TOO_LONG", field: "notes" });
    expect(
      refusal(() =>
        siteDiaryContent(
          {
            diaryDate: TODAY,
            weatherMorning: "snow" as never,
          },
          TODAY,
        ),
      ),
    ).toEqual({ code: "SITE_DIARY_WEATHER_INVALID", field: "weatherMorning" });
  });
});

describe("siteDiaryVisitors", () => {
  it("needs a name and HH:MM times with time out not before time in", () => {
    expect(refusal(() => siteDiaryVisitors([{ name: " " }]))).toEqual({
      code: "SITE_DIARY_VISITOR_NAME_REQUIRED",
      field: "visitors.0.name",
    });
    expect(
      refusal(() =>
        siteDiaryVisitors([{ name: "A" }, { name: "B", timeIn: "9:00" }]),
      ),
    ).toEqual({ code: "SITE_DIARY_TIME_INVALID", field: "visitors.1.timeIn" });
    expect(
      refusal(() => siteDiaryVisitors([{ name: "A", timeOut: "24:00" }])),
    ).toEqual({
      code: "SITE_DIARY_TIME_INVALID",
      field: "visitors.0.timeOut",
    });
    expect(
      refusal(() =>
        siteDiaryVisitors([{ name: "A", timeIn: "14:00", timeOut: "13:59" }]),
      ),
    ).toEqual({
      code: "SITE_DIARY_TIME_OUT_BEFORE_IN",
      field: "visitors.0.timeOut",
    });
    expect(
      siteDiaryVisitors([{ name: "A", timeIn: "14:00", timeOut: "14:00" }])[0]
        ?.timeOut,
    ).toBe("14:00");
    expect(
      siteDiaryVisitors([{ name: "A", timeOut: "08:00" }])[0],
    ).toMatchObject({
      timeIn: null,
      timeOut: "08:00",
    });
  });

  it("holds at most 50 rows", () => {
    const rows = Array.from({ length: 51 }, () => ({ name: "A" }));
    expect(refusal(() => siteDiaryVisitors(rows)).code).toBe(
      "SITE_DIARY_TOO_MANY_VISITORS",
    );
    expect(siteDiaryVisitors(rows.slice(0, 50))).toHaveLength(50);
  });
});

describe("siteDiaryInstructions", () => {
  it("needs who gave it and the instruction", () => {
    expect(
      refusal(() => siteDiaryInstructions([{ givenBy: "", instruction: "x" }])),
    ).toEqual({
      code: "SITE_DIARY_GIVEN_BY_REQUIRED",
      field: "instructions.0.givenBy",
    });
    expect(
      refusal(() =>
        siteDiaryInstructions([{ givenBy: "PMC", instruction: " " }]),
      ),
    ).toEqual({
      code: "SITE_DIARY_INSTRUCTION_REQUIRED",
      field: "instructions.0.instruction",
    });
    expect(
      refusal(() =>
        siteDiaryInstructions([
          {
            givenBy: "PMC",
            instruction: "x".repeat(SITE_DIARY_LIMITS.instruction + 1),
          },
        ]),
      ),
    ).toEqual({ code: "TEXT_TOO_LONG", field: "instructions.0.instruction" });
    const rows = Array.from({ length: 51 }, () => ({
      givenBy: "A",
      instruction: "B",
    }));
    expect(refusal(() => siteDiaryInstructions(rows)).code).toBe(
      "SITE_DIARY_TOO_MANY_INSTRUCTIONS",
    );
  });
});
