import { z } from "zod";

import type {
  DashboardApprovalItem,
  HrmsDashboard,
} from "@/src/hrms/application/dashboard-queries";
import { LIVE_STATES } from "@/src/hrms/domain/attendance";
import { HOLIDAY_TYPES } from "@/src/hrms/domain/holiday";
import { LEAVE_REQUEST_STATUSES } from "@/src/hrms/domain/leave-request";

export const DASHBOARD_PATH = "/api/construction/hrms/dashboard";

const DAY_STATUSES = [
  "present",
  "half_day",
  "absent",
  "on_leave",
  "holiday",
  "week_off",
] as const;

const DayCountsModel = z.object({
  present: z.int(),
  halfDay: z.int(),
  absent: z
    .int()
    .describe(
      "Absent; for today, also everyone not checked in yet and anyone who checked out short of the half-day hours.",
    ),
  onLeave: z.int().describe("Approved leave, a full day or half a day."),
  holiday: z.int(),
  weekOff: z.int(),
});

const ApprovalItemModel = z.object({
  kind: z.enum(["attendance", "leave", "cancellation"]),
  id: z.uuid(),
  memberName: z.string(),
  title: z.string(),
  fromDate: z.iso.date(),
  toDate: z.iso.date(),
  days: z.number().nullable().describe("Leave days; null for attendance."),
  requestedAt: z.iso.datetime(),
});

export const GetConstructionHrmsDashboardResponseModel = z.object({
  today: z.iso.date().describe("Today, Company date."),
  timeZone: z.string(),
  permissions: z
    .object({
      viewTeam: z.boolean(),
      checkIn: z.boolean(),
      applyLeave: z.boolean(),
      approveAttendance: z.boolean(),
      approveLeave: z.boolean(),
      viewTeamLeaves: z.boolean(),
      viewHolidays: z.boolean(),
    })
    .describe("Which sections and quick actions the caller may use."),
  team: z
    .object({
      employees: z.int(),
      presentToday: z.int(),
      onLeave: z.int(),
      notCheckedIn: z.int(),
      late: z.int(),
      breakdown: DayCountsModel,
      trend: z
        .array(DayCountsModel.extend({ date: z.iso.date() }))
        .describe("The last 14 Company dates, oldest first; today as of now."),
    })
    .nullable()
    .describe("Null without View All on Attendance Management."),
  approvals: z
    .object({
      total: z.int(),
      attendance: z.int().nullable(),
      leave: z.int().nullable(),
      cancellations: z.int().nullable(),
      items: z.array(ApprovalItemModel).describe("The oldest five."),
    })
    .nullable()
    .describe(
      "What the caller may decide now; null without approve or reject on attendance or leave.",
    ),
  teamLeaves: z
    .object({
      total: z.int(),
      items: z.array(
        z.object({
          id: z.uuid(),
          memberName: z.string(),
          leaveTypeName: z.string(),
          fromDate: z.iso.date(),
          toDate: z.iso.date(),
          totalDays: z.number(),
          status: z.enum(LEAVE_REQUEST_STATUSES),
        }),
      ),
    })
    .nullable()
    .describe(
      "Leave with a day in the next 14 days; null without View All on Leave Management.",
    ),
  holidays: z
    .array(
      z.object({
        id: z.uuid(),
        name: z.string(),
        date: z.iso.date(),
        type: z.enum(HOLIDAY_TYPES),
        isOptional: z.boolean(),
      }),
    )
    .nullable()
    .describe("The next holidays; null without Holiday Management read."),
  me: z
    .object({
      memberId: z.uuid(),
      name: z.string(),
      today: z
        .object({
          state: z.enum(LIVE_STATES),
          status: z.enum(DAY_STATUSES),
          shiftName: z.string(),
          holidayName: z.string().nullable(),
          firstCheckInAt: z.iso.datetime().nullable(),
          lastCheckOutAt: z.iso.datetime().nullable(),
          workedHours: z.number(),
          late: z.boolean(),
          openFromEarlierDay: z.boolean(),
        })
        .nullable(),
      leaveYear: z.string().nullable(),
      balances: z
        .array(
          z.object({
            leaveTypeId: z.uuid(),
            leaveTypeName: z.string(),
            isPaid: z.boolean(),
            entitlement: z.number(),
            available: z.number(),
            pending: z.number(),
          }),
        )
        .nullable(),
      pending: z.object({
        attendance: z.int().nullable(),
        leave: z.int().nullable(),
        items: z.array(ApprovalItemModel),
      }),
    })
    .nullable()
    .describe(
      "The caller's own day, balances and requests; null when they are not a Team Member.",
    ),
});

export type GetConstructionHrmsDashboardResponseModel = z.infer<
  typeof GetConstructionHrmsDashboardResponseModel
>;

function item(value: DashboardApprovalItem) {
  return { ...value, requestedAt: value.requestedAt.toISOString() };
}

export function toDashboardResponse(
  dashboard: HrmsDashboard,
): GetConstructionHrmsDashboardResponseModel {
  const { me } = dashboard;
  return GetConstructionHrmsDashboardResponseModel.parse({
    ...dashboard,
    approvals:
      dashboard.approvals == null
        ? null
        : { ...dashboard.approvals, items: dashboard.approvals.items.map(item) },
    me:
      me == null
        ? null
        : {
            ...me,
            today:
              me.today == null
                ? null
                : {
                    ...me.today,
                    firstCheckInAt:
                      me.today.firstCheckInAt?.toISOString() ?? null,
                    lastCheckOutAt:
                      me.today.lastCheckOutAt?.toISOString() ?? null,
                  },
            pending: { ...me.pending, items: me.pending.items.map(item) },
          },
  });
}
