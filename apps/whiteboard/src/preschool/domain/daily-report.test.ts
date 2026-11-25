import { describe, expect, it } from "vitest";

import {
  applyClassroomItems,
  dailyReportContent,
  EMPTY_DAILY_REPORT,
} from "./daily-report";
import { PreschoolError } from "./errors";

function codeOf(work: () => unknown): string | null {
  try {
    work();
    return null;
  } catch (error) {
    if (error instanceof PreschoolError) return error.code;
    throw error;
  }
}

describe("dailyReportContent", () => {
  it("tidies a full report", () => {
    expect(
      dailyReportContent({
        meals: [
          { meal: "lunch", menu: " Rice and dal ", ate: "some" },
          { meal: "breakfast", menu: "", ate: "all" },
        ],
        napFrom: "13:00",
        napTo: "14:15",
        toilet: [
          { time: "12:00", kind: "potty" },
          { time: "10:00", kind: "diaper_wet" },
        ],
        mood: "happy",
        activities: [" Clay ", ""],
        note: "  ",
        photos: ["https://cdn.example.test/a.jpg"],
      }),
    ).toEqual({
      meals: [
        { meal: "breakfast", menu: null, ate: "all" },
        { meal: "lunch", menu: "Rice and dal", ate: "some" },
      ],
      napFrom: "13:00",
      napTo: "14:15",
      toilet: [
        { time: "10:00", kind: "diaper_wet" },
        { time: "12:00", kind: "potty" },
      ],
      mood: "happy",
      activities: ["Clay"],
      note: null,
      photos: ["https://cdn.example.test/a.jpg"],
    });
    expect(dailyReportContent({})).toEqual(EMPTY_DAILY_REPORT);
  });

  it("records each meal once", () => {
    expect(
      codeOf(() =>
        dailyReportContent({
          meals: [
            { meal: "snack", ate: "all" },
            { meal: "snack", ate: "none" },
          ],
        }),
      ),
    ).toBe("MEAL_REPEATED");
  });

  it("needs both ends of a nap, in order", () => {
    expect(codeOf(() => dailyReportContent({ napFrom: "13:00" }))).toBe(
      "NAP_INCOMPLETE",
    );
    expect(
      codeOf(() => dailyReportContent({ napFrom: "14:00", napTo: "13:00" })),
    ).toBe("NAP_ORDER");
    expect(
      codeOf(() => dailyReportContent({ napFrom: "14:00", napTo: "14:00" })),
    ).toBe("NAP_ORDER");
    expect(
      codeOf(() => dailyReportContent({ napFrom: "2pm", napTo: "3pm" })),
    ).toBe("TIME_INVALID");
  });

  it("limits toilet entries, activities, the note and photos", () => {
    const toilet = Array.from({ length: 13 }, () => ({
      time: "10:00",
      kind: "potty" as const,
    }));
    expect(codeOf(() => dailyReportContent({ toilet }))).toBe(
      "TOO_MANY_TOILET_ENTRIES",
    );
    expect(
      codeOf(() =>
        dailyReportContent({
          activities: Array.from({ length: 11 }, (_, i) => `A${String(i)}`),
        }),
      ),
    ).toBe("TOO_MANY_ACTIVITIES");
    expect(
      codeOf(() => dailyReportContent({ activities: ["x".repeat(121)] })),
    ).toBe("ACTIVITY_TOO_LONG");
    expect(codeOf(() => dailyReportContent({ note: "x".repeat(2001) }))).toBe(
      "NOTE_TOO_LONG",
    );
    expect(
      codeOf(() =>
        dailyReportContent({
          photos: Array.from({ length: 7 }, () => "https://x.test/p.jpg"),
        }),
      ),
    ).toBe("TOO_MANY_PHOTOS");
    expect(
      codeOf(() => dailyReportContent({ photos: ["http://x.test/p.jpg"] })),
    ).toBe("PHOTO_URL_INVALID");
  });
});

describe("applyClassroomItems", () => {
  it("sets menus, keeping an ate already chosen, and adds new activities", () => {
    const report = dailyReportContent({
      meals: [{ meal: "lunch", menu: "Old", ate: "none" }],
      napFrom: "13:00",
      napTo: "14:00",
      mood: "tired",
      activities: ["Clay"],
      note: "Slept well",
    });
    const applied = applyClassroomItems(report, {
      meals: [
        { meal: "lunch", menu: "Curd rice" },
        { meal: "snack", menu: "Fruit" },
      ],
      activities: ["clay", "Rhymes"],
    });
    expect(applied.meals).toEqual([
      { meal: "snack", menu: "Fruit", ate: "all" },
      { meal: "lunch", menu: "Curd rice", ate: "none" },
    ]);
    expect(applied.activities).toEqual(["Clay", "Rhymes"]);
    expect(applied).toMatchObject({
      napFrom: "13:00",
      napTo: "14:00",
      mood: "tired",
      note: "Slept well",
    });
  });

  it("stops adding activities at the limit", () => {
    const full = {
      ...EMPTY_DAILY_REPORT,
      activities: Array.from({ length: 10 }, (_, i) => `A${String(i)}`),
    };
    expect(
      applyClassroomItems(full, { activities: ["New"] }).activities,
    ).toHaveLength(10);
  });
});
