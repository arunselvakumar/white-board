import { prisma, type PrismaClient } from "@repo/construction-db";

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
  NoAttendanceDaySource,
  NoLeaveDaySource,
} from "../application/stub-ports";
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

/**
 * Every port of the hrms context, wired once. The stand-ins come from
 * `stub-ports.ts`; the ticket that builds the real one replaces it here.
 */
export function createHrmsPorts(deps?: { prisma?: PrismaClient }): HrmsPorts {
  const db = deps?.prisma ?? prisma;
  const settings = new PrismaHrmsSettingsStore(db);
  // Holidays (CM-305) and week offs from shifts and rotations (CM-307).
  const books = new PrismaShiftBookSource(db, settings);
  const calendar = new ShiftWorkCalendar(new PrismaHolidayStore(db), books);
  return {
    employees: new PrismaEmployeeDirectory(db),
    projects: new PrismaProjectDirectory(db),
    settings,
    calendar,
    shifts: new BookEffectiveShiftResolver(books),
    // Replaced by CM-308.
    attendanceDays: new NoAttendanceDaySource(calendar),
    // Replaced by CM-312.
    leaveDays: new NoLeaveDaySource(),
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
