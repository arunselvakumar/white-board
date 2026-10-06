import { describe, expect, it } from "vitest";

import type { Holiday } from "../domain/holiday";
import {
  ClassChangeHandlers,
  latestToday,
  type ChangeableBatch,
  type ClassChangeStore,
} from "./class-change-handlers";

// 19:00 UTC on 2 Nov is 00:30 on 3 Nov in Kolkata and 14:00 on 2 Nov in New York.
const NOW = new Date("2026-11-02T19:00:00.000Z");
const owner = {
  workspaceId: "org_1",
  userId: "user_owner",
  role: "owner" as const,
};

function batch(id: string, timezone: string): ChangeableBatch {
  return {
    id,
    timezone,
    closed: false,
    sources: [
      {
        batchId: id,
        timings: [
          {
            daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
            startTime: "09:00",
            endTime: "10:00",
          },
        ],
      },
    ],
  };
}

function handlers(holidays: Holiday[] = [], now = NOW) {
  const saved: Holiday[] = [];
  const store: ClassChangeStore = {
    withBatchLock: (_workspaceId, _batchId, work) => work(store),
    withWorkspaceLock: (_workspaceId, work) => work(store),
    findBatch: () => Promise.resolve(null),
    openBatches: () =>
      Promise.resolve([
        batch("batch-kolkata", "Asia/Kolkata"),
        batch("batch-new-york", "America/New_York"),
      ]),
    isAssignedTeacher: () => Promise.resolve(false),
    activeChanges: () => Promise.resolve([]),
    activeHolidays: () => Promise.resolve(holidays),
    findHoliday: (_workspaceId, id) =>
      Promise.resolve(holidays.find((holiday) => holiday.id === id) ?? null),
    hasSavedAttendance: () => Promise.resolve(false),
    hasOccurrence: () => Promise.resolve(false),
    saveChange: () => Promise.resolve(),
    saveHoliday: (holiday) => {
      saved.push(holiday);
      return Promise.resolve();
    },
  };
  return { sut: new ClassChangeHandlers({ store, now: () => now }), saved };
}

describe("Holidays across timezones", () => {
  it("uses the latest local date, so no Batch's past day can become a Holiday", () => {
    expect(latestToday(NOW, ["America/New_York", "Asia/Kolkata"])).toBe(
      "2026-11-03",
    );
    expect(latestToday(NOW, [])).toBe("2026-11-02");
  });

  it("refuses a Holiday on a date that is already over in Kolkata", async () => {
    const { sut } = handlers();
    await expect(
      sut.declareHoliday(owner, {
        startDate: "2026-11-02",
        endDate: "2026-11-02",
      }),
    ).rejects.toMatchObject({ code: "HOLIDAY_IN_PAST" });
  });

  it("allows a Holiday from the latest local today", async () => {
    const { sut, saved } = handlers();
    await expect(
      sut.declareHoliday(owner, {
        startDate: "2026-11-03",
        endDate: "2026-11-04",
      }),
    ).resolves.toMatchObject({ startDate: "2026-11-03" });
    expect(saved).toHaveLength(1);
  });

  it("removes an upcoming Holiday but not one that has begun for any Batch", async () => {
    const { sut: declare, saved } = handlers();
    await declare.declareHoliday(owner, {
      startDate: "2026-11-03",
      endDate: "2026-11-03",
    });
    const [holiday] = saved;
    if (holiday == null) throw new Error("Holiday not saved");

    // 19:00 UTC on 3 Nov: still 3 Nov in New York, already 4 Nov in Kolkata.
    const begun = handlers([holiday], new Date("2026-11-03T19:00:00.000Z"));
    await expect(
      begun.sut.removeHoliday(owner, holiday.id),
    ).rejects.toMatchObject({
      code: "HOLIDAY_STARTED",
    });
    await expect(
      handlers([holiday]).sut.removeHoliday(owner, holiday.id),
    ).resolves.toBeUndefined();
  });
});
