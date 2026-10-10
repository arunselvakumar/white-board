import { prisma, type PrismaClient } from "@repo/construction-db";

import { HrmsSettingsHandlers } from "../application/hrms-settings-handlers";
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
import {
  NoAttendanceDaySource,
  NoLeaveDaySource,
  SettingsShiftResolver,
  SettingsWorkCalendar,
} from "../application/stub-ports";
import {
  PrismaEmployeeDirectory,
  PrismaProjectDirectory,
} from "./prisma-directories";
import { PrismaHrmsSettingsStore } from "./prisma-hrms-settings-store";
import { PrismaMonthLock } from "./prisma-month-lock";
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
  // Replaced by CM-305 (holidays) and CM-307 (shift week offs).
  const calendar = new SettingsWorkCalendar(settings);
  return {
    employees: new PrismaEmployeeDirectory(db),
    projects: new PrismaProjectDirectory(db),
    settings,
    calendar,
    // Replaced by CM-307.
    shifts: new SettingsShiftResolver(settings),
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
