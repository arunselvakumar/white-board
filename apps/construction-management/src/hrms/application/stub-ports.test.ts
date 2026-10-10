import { describe, expect, it } from "vitest";

import { DEFAULT_HRMS_SETTINGS } from "../domain/hrms-settings";
import { FakeHrmsSettingsStore } from "./hrms-fakes";
import { InMemoryStatutoryRates } from "./in-memory-statutory-rates";
import {
  NoAttendanceDaySource,
  NoLeaveDaySource,
  SettingsShiftResolver,
  SettingsWorkCalendar,
} from "./stub-ports";

const COMPANY = "company-1";

describe("stand-in ports", () => {
  it("work from the Settings until shifts, holidays and attendance exist", async () => {
    const settings = new FakeHrmsSettingsStore();
    const calendar = new SettingsWorkCalendar(settings);
    const shifts = new SettingsShiftResolver(settings);

    expect(await calendar.isWeekOff(COMPANY, "m1", "2026-10-10")).toBe(true);
    expect(await calendar.isWeekOff(COMPANY, "m1", "2026-10-09")).toBe(false);
    expect(await calendar.isHoliday(COMPANY, "m1", "2026-10-02")).toBe(false);

    const friday = await shifts.shiftFor(COMPANY, "m1", "2026-10-09");
    expect(friday).toMatchObject({
      source: "settings",
      workingHours: DEFAULT_HRMS_SETTINGS.workingHoursPerDay,
      halfDayHours: DEFAULT_HRMS_SETTINGS.halfDayHours,
      graceMinutes: 15,
      overtimeAllowed: false,
      isWorkingDay: true,
    });
    expect((await shifts.shiftsForMonth(COMPANY, "m1", "2026-02")).size).toBe(
      28,
    );

    const days = await new NoAttendanceDaySource(calendar).monthFor(
      COMPANY,
      ["m1", "m2"],
      "2026-10",
    );
    const october = days.get("m2") ?? [];
    expect(october).toHaveLength(31);
    // 1 October 2026 is a Thursday; the 3rd a Saturday.
    expect(october[0]?.status).toBe("absent");
    expect(october[2]?.status).toBe("week_off");

    const leave = await new NoLeaveDaySource().approvedForMonth(
      COMPANY,
      ["m1"],
      "2026-10",
    );
    expect(leave.get("m1")).toEqual([]);
  });

  it("answer statutory figures from rows in memory", async () => {
    const rates = new InMemoryStatutoryRates({
      pf: [
        {
          effectiveFrom: "2014-09-01",
          wageCeiling: 1_500_000,
          employeePercent: "12.00",
          employerPercent: "12.00",
          epsPercent: "8.33",
          source: "test",
        },
      ],
      esi: [],
      pt: [
        {
          stateCode: "29",
          effectiveFrom: "2025-04-01",
          appliesTo: "everyone",
          grossFrom: 2_500_000,
          grossTo: null,
          monthlyAmount: 20_000,
          specialMonth: 2,
          specialMonthAmount: 30_000,
          source: "test",
        },
      ],
    });
    expect((await rates.pfFor("2026-10"))?.wageCeiling).toBe(1_500_000);
    expect(await rates.esiFor("2026-10")).toBeNull();
    expect((await rates.ptFor("29", "2027-02", 3_000_000)).amount).toBe(30_000);
    expect((await rates.ptFor("29", "2026-10", 2_499_999)).amount).toBe(0);
  });
});
