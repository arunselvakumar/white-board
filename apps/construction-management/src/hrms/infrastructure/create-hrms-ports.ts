import { prisma, type PrismaClient } from "@repo/construction-db";

import { RecordedAttendanceDaySource } from "../application/attendance-days";
import { AttendanceHandlers } from "../application/attendance-handlers";
import { BranchHandlers } from "../application/branch-handlers";
import {
  BookEffectiveShiftResolver,
  ShiftWorkCalendar,
} from "../application/effective-shift-resolver";
import { HolidayHandlers } from "../application/holiday-handlers";
import { HrmsSettingsHandlers } from "../application/hrms-settings-handlers";
import { MemberFences } from "../application/member-fences";
import type {
  AttendanceDaySource,
  EffectiveShiftResolver,
  EmployeeDirectory,
  HrmsSettingsReader,
  LeaveDaySource,
  MonthLock,
  ProjectDirectory,
  StatutoryRates,
  WorkCalendar,
} from "../application/ports";
import { ShiftAssignmentHandlers } from "../application/shift-assignment-handlers";
import { ShiftTemplateHandlers } from "../application/shift-template-handlers";
import {
  PrismaAttendanceBackdatedGuard,
  PrismaAttendanceStore,
  companyTimeZone,
} from "./prisma-attendance-store";
import { PrismaBranchStore } from "./prisma-branch-store";
import { companyToday } from "./prisma-calendar-support";
import {
  PrismaEmployeeDirectory,
  PrismaProjectDirectory,
} from "./prisma-directories";
import {
  PrismaHolidayBackdatedGuard,
  PrismaHolidayStore,
} from "./prisma-holiday-store";
import { PrismaHrmsSettingsStore } from "./prisma-hrms-settings-store";
import { PrismaLeaveDaySource } from "./prisma-leave-day-source";
import { PrismaMonthLock } from "./prisma-month-lock";
import {
  PrismaShiftAssignmentStore,
  PrismaShiftBookSource,
} from "./prisma-shift-assignment-store";
import {
  PrismaRotationTemplateStore,
  PrismaShiftTemplateStore,
} from "./prisma-shift-template-store";
import { PrismaStatutoryRates } from "./prisma-statutory-rates";

export type HrmsPorts = {
  employees: EmployeeDirectory;
  projects: ProjectDirectory;
  settings: HrmsSettingsReader;
  calendar: WorkCalendar;
  shifts: EffectiveShiftResolver;
  attendanceDays: AttendanceDaySource;
  leaveDays: LeaveDaySource;
  monthLock: MonthLock;
  statutoryRates: StatutoryRates;
};

/** Every port of the hrms context, wired once. */
export function createHrmsPorts(deps?: { prisma?: PrismaClient }): HrmsPorts {
  const db = deps?.prisma ?? prisma;
  const settings = new PrismaHrmsSettingsStore(db);
  // Holidays (CM-305) and week offs from shifts and rotations (CM-307).
  const books = new PrismaShiftBookSource(db, settings);
  const holidays = new PrismaHolidayStore(db);
  const calendar = new ShiftWorkCalendar(holidays, books);
  // Replaced by CM-312.
  const leaveDays = new PrismaLeaveDaySource(db);
  return {
    employees: new PrismaEmployeeDirectory(db),
    projects: new PrismaProjectDirectory(db),
    settings,
    calendar,
    shifts: new BookEffectiveShiftResolver(books),
    // Recorded entries, shifts, holidays and approved leave (CM-308).
    attendanceDays: new RecordedAttendanceDaySource({
      books,
      holidays,
      entries: new PrismaAttendanceStore(db),
      leave: leaveDays,
      timeZone: (workspaceId) => companyTimeZone(db, workspaceId),
    }),
    leaveDays,
    monthLock: new PrismaMonthLock(db),
    statutoryRates: new PrismaStatutoryRates(db),
  };
}

/** HRMS Settings (CM-303). */
export function createHrmsSettingsHandlers(deps?: { prisma?: PrismaClient }) {
  const db = deps?.prisma ?? prisma;
  return new HrmsSettingsHandlers(new PrismaHrmsSettingsStore(db));
}

/** Branches & Sites and `my-fences` (CM-304). */
export function createBranchHandlers(deps?: { prisma?: PrismaClient }) {
  const db = deps?.prisma ?? prisma;
  return new BranchHandlers(
    new PrismaBranchStore(db),
    new PrismaProjectDirectory(db),
    new PrismaEmployeeDirectory(db),
  );
}

/**
 * The fences that apply to a member (CM-304, ADR CM-0012 §4), for
 * check-in (CM-308): `createMemberFences().fencesFor(workspaceId, memberId)`.
 */
export function createMemberFences(deps?: {
  prisma?: PrismaClient;
}): MemberFences {
  const db = deps?.prisma ?? prisma;
  return new MemberFences(
    new PrismaBranchStore(db),
    new PrismaEmployeeDirectory(db),
  );
}

/** Holidays and the holiday import (CM-305). */
export function createHolidayHandlers(deps?: { prisma?: PrismaClient }) {
  const db = deps?.prisma ?? prisma;
  return new HolidayHandlers(
    new PrismaHolidayStore(db),
    new PrismaHolidayBackdatedGuard(db),
    (workspaceId) => companyToday(db, workspaceId),
  );
}

/** Shift and rotation templates (CM-306). */
export function createShiftTemplateHandlers(deps?: { prisma?: PrismaClient }) {
  const db = deps?.prisma ?? prisma;
  return new ShiftTemplateHandlers(
    new PrismaShiftTemplateStore(db),
    new PrismaRotationTemplateStore(db),
  );
}

/** Shift Management: assignments until changed (CM-307). */
export function createShiftAssignmentHandlers(deps?: {
  prisma?: PrismaClient;
}) {
  const db = deps?.prisma ?? prisma;
  return new ShiftAssignmentHandlers(
    new PrismaShiftAssignmentStore(db),
    new PrismaShiftTemplateStore(db),
    new PrismaRotationTemplateStore(db),
    new PrismaEmployeeDirectory(db),
    new PrismaMonthLock(db),
    (workspaceId) => companyToday(db, workspaceId),
  );
}

/**
 * Attendance (CM-308, CM-309): check in and out, missed checkout,
 * back-dated days, approvals, Team Today and the monthly summary.
 */
export function createAttendanceHandlers(deps?: { prisma?: PrismaClient }) {
  const db = deps?.prisma ?? prisma;
  const ports = createHrmsPorts({ prisma: db });
  const store = new PrismaAttendanceStore(db);
  const timeZone = (workspaceId: string) => companyTimeZone(db, workspaceId);
  // The same day source as `ports.attendanceDays`, typed for date ranges.
  const days = new RecordedAttendanceDaySource({
    books: new PrismaShiftBookSource(db, ports.settings),
    holidays: new PrismaHolidayStore(db),
    entries: store,
    leave: ports.leaveDays,
    timeZone,
  });
  return new AttendanceHandlers({
    store,
    employees: ports.employees,
    settings: ports.settings,
    fences: createMemberFences({ prisma: db }),
    shifts: ports.shifts,
    calendar: ports.calendar,
    days,
    monthLock: ports.monthLock,
    guard: new PrismaAttendanceBackdatedGuard(db),
    timeZone,
  });
}
