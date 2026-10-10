import type { CalendarDate } from "@/src/shared-kernel/calendar-date";

import { datesOf, type MonthKey } from "../domain/calendar";
import {
  isSettingsWorkingDay,
  type HrmsSettings,
} from "../domain/hrms-settings";
import type {
  AttendanceDay,
  AttendanceDaySource,
  EffectiveShift,
  EffectiveShiftResolver,
  HrmsHoliday,
  HrmsSettingsReader,
  LeaveDay,
  LeaveDaySource,
  WorkCalendar,
  WorkCalendarDay,
} from "./ports";

/**
 * Stand-ins for ports whose tickets have not landed, so the app compiles
 * and runs end to end. Each says which ticket replaces it; that ticket
 * writes the real implementation and swaps it in
 * `infrastructure/create-hrms-ports.ts`. They answer from the Settings
 * alone, as a Company with no holidays, shifts, attendance or leave would.
 */

function settingsShift(
  settings: HrmsSettings,
  date: CalendarDate,
): EffectiveShift {
  return {
    source: "settings",
    shiftTemplateId: null,
    rotationTemplateId: null,
    name: "Standard",
    startTime: null,
    endTime: null,
    workingHours: settings.workingHoursPerDay,
    halfDayHours: settings.halfDayHours,
    graceMinutes: settings.graceMinutes,
    overtimeAllowed: false,
    isWorkingDay: isSettingsWorkingDay(settings, date),
  };
}

// Replaced by CM-307 (shift assignments and rotations).
/** Everyone works the Settings day: no shift, no rotation, no overtime pay. */
export class SettingsShiftResolver implements EffectiveShiftResolver {
  constructor(private readonly settings: HrmsSettingsReader) {}

  async shiftFor(
    workspaceId: string,
    _memberId: string,
    date: CalendarDate,
  ): Promise<EffectiveShift> {
    return settingsShift(await this.settings.settingsFor(workspaceId), date);
  }

  async shiftsForMonth(
    workspaceId: string,
    _memberId: string,
    month: MonthKey,
  ): Promise<Map<CalendarDate, EffectiveShift>> {
    const settings = await this.settings.settingsFor(workspaceId);
    return new Map(
      datesOf(month).map((date) => [date, settingsShift(settings, date)]),
    );
  }
}

// Replaced by CM-305 (holidays) and CM-307 (week offs from shifts).
/** No holidays; week offs are the weekdays the Settings do not work. */
export class SettingsWorkCalendar implements WorkCalendar {
  constructor(private readonly settings: HrmsSettingsReader) {}

  holidayFor(
    _workspaceId: string,
    _memberId: string,
    _date: CalendarDate,
  ): Promise<HrmsHoliday | null> {
    return Promise.resolve(null);
  }

  isHoliday(
    _workspaceId: string,
    _memberId: string,
    _date: CalendarDate,
  ): Promise<boolean> {
    return Promise.resolve(false);
  }

  async isWeekOff(
    workspaceId: string,
    _memberId: string,
    date: CalendarDate,
  ): Promise<boolean> {
    return !isSettingsWorkingDay(
      await this.settings.settingsFor(workspaceId),
      date,
    );
  }

  async monthFor(
    workspaceId: string,
    memberIds: readonly string[],
    month: MonthKey,
  ): Promise<Map<string, WorkCalendarDay[]>> {
    const settings = await this.settings.settingsFor(workspaceId);
    const days: WorkCalendarDay[] = datesOf(month).map((date) => ({
      date,
      kind: isSettingsWorkingDay(settings, date) ? "working" : "week_off",
      holiday: null,
    }));
    return new Map(memberIds.map((id) => [id, days]));
  }
}

// Replaced by CM-308 (attendance entries and day status).
/** No attendance recorded: working days are absent. */
export class NoAttendanceDaySource implements AttendanceDaySource {
  constructor(private readonly calendar: WorkCalendar) {}

  async monthFor(
    workspaceId: string,
    memberIds: readonly string[],
    month: MonthKey,
  ): Promise<Map<string, AttendanceDay[]>> {
    const calendar = await this.calendar.monthFor(
      workspaceId,
      memberIds,
      month,
    );
    return new Map(
      [...calendar].map(([memberId, days]) => [
        memberId,
        days.map((day) => ({
          date: day.date,
          status: day.kind === "working" ? "absent" : day.kind,
          workedHours: 0,
          overtimeHours: 0,
          late: false,
          leave: null,
        })),
      ]),
    );
  }
}

// Replaced by CM-312 (leave requests).
/** No approved leave. */
export class NoLeaveDaySource implements LeaveDaySource {
  approvedForMonth(
    _workspaceId: string,
    memberIds: readonly string[],
    _month: MonthKey,
  ): Promise<Map<string, LeaveDay[]>> {
    return Promise.resolve(new Map(memberIds.map((id) => [id, []])));
  }
}
