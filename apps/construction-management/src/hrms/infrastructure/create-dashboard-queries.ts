import { prisma, type PrismaClient } from "@repo/construction-db";

import { todayIn } from "@/src/shared-kernel/calendar-date";

import { RecordedAttendanceDaySource } from "../application/attendance-days";
import { HrmsDashboardQueries } from "../application/dashboard-queries";
import {
  createAttendanceHandlers,
  createHolidayHandlers,
  createHrmsPorts,
} from "./create-hrms-ports";
import { createLeaveHandlers } from "./create-leave-handlers";
import {
  companyTimeZone,
  PrismaAttendanceStore,
} from "./prisma-attendance-store";
import { PrismaHolidayStore } from "./prisma-holiday-store";
import { PrismaShiftBookSource } from "./prisma-shift-assignment-store";

/**
 * The HRMS Dashboard (CM-319) over the attendance, leave and holiday
 * services, wired the way their own routes wire them.
 */
export function createDashboardQueries(deps?: {
  prisma?: PrismaClient;
}): HrmsDashboardQueries {
  const db = deps?.prisma ?? prisma;
  const ports = createHrmsPorts({ prisma: db });
  const leave = createLeaveHandlers({ prisma: db });
  const timeZone = (workspaceId: string) => companyTimeZone(db, workspaceId);
  return new HrmsDashboardQueries({
    employees: ports.employees,
    // The day source attendance uses, typed for date ranges.
    days: new RecordedAttendanceDaySource({
      books: new PrismaShiftBookSource(db, ports.settings),
      holidays: new PrismaHolidayStore(db),
      entries: new PrismaAttendanceStore(db),
      leave: ports.leaveDays,
      timeZone,
    }),
    attendance: createAttendanceHandlers({ prisma: db }),
    leaveRequests: leave.requests,
    leaveBalances: leave.balances,
    holidays: createHolidayHandlers({ prisma: db }),
    moment: async (workspaceId) => {
      const zone = await timeZone(workspaceId);
      return { today: todayIn(zone), timeZone: zone };
    },
  });
}
