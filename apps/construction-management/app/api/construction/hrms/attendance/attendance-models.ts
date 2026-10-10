import { z } from "zod";

import type {
  MonthlySummary,
  PendingApproval,
  StoredAttendanceEntry,
  TeamToday,
  TodayView,
} from "@/src/hrms/application/attendance-handlers";
import type { AttendanceDay, HrmsEmployee } from "@/src/hrms/application/ports";
import {
  APPROVAL_STATUSES,
  ATTENDANCE_SOURCES,
  hoursBetween,
  LIVE_STATES,
  type DayCounts,
  type GpsFix,
} from "@/src/hrms/domain/attendance";
import { GPS_REQUIREMENTS } from "@/src/hrms/domain/hrms-settings";

export const ATTENDANCE_PATH = "/api/construction/hrms/attendance";

const DAY_STATUSES = [
  "present",
  "half_day",
  "absent",
  "on_leave",
  "holiday",
  "week_off",
] as const;

export const HrmsAttendanceIdParamsModel = z.object({ id: z.uuid() });

const location = {
  latitude: z
    .number()
    .nullable()
    .optional()
    .describe("Device latitude; send both coordinates or neither."),
  longitude: z.number().nullable().optional(),
  accuracyMetres: z
    .number()
    .nullable()
    .optional()
    .describe(
      "The accuracy the device reported, metres; up to 50 m of it counts toward the fence.",
    ),
};

export const CheckInConstructionHrmsAttendanceRequestModel = z.object(location);

export type CheckInConstructionHrmsAttendanceRequestModel = z.input<
  typeof CheckInConstructionHrmsAttendanceRequestModel
>;

export const CheckOutConstructionHrmsAttendanceRequestModel =
  z.object(location);

export type CheckOutConstructionHrmsAttendanceRequestModel = z.input<
  typeof CheckOutConstructionHrmsAttendanceRequestModel
>;

export const AddConstructionHrmsMissedCheckoutRequestModel = z.object({
  entryId: z.uuid().describe("The entry left open on an earlier day."),
  checkOutDate: z
    .string()
    .describe("YYYY-MM-DD, Company time; the check-in's date or the next."),
  checkOutTime: z.string().describe("HH:MM, 24-hour, Company time."),
  reason: z.string().describe("Why the checkout was missed; 3–500 characters."),
  expectedUpdatedAt: z.iso
    .datetime()
    .describe("The entry's `updatedAt`; a mismatch is 409 ATTENDANCE_CHANGED."),
});

export type AddConstructionHrmsMissedCheckoutRequestModel = z.input<
  typeof AddConstructionHrmsMissedCheckoutRequestModel
>;

export const AddConstructionHrmsManualAttendanceRequestModel = z.object({
  date: z.string().describe("YYYY-MM-DD, before today."),
  checkInTime: z.string().describe("HH:MM, 24-hour, Company time."),
  checkOutTime: z
    .string()
    .describe("HH:MM; at or before the check-in means the next day."),
  reason: z.string().describe("Why it is entered late; 3–500 characters."),
});

export type AddConstructionHrmsManualAttendanceRequestModel = z.input<
  typeof AddConstructionHrmsManualAttendanceRequestModel
>;

export const ApproveConstructionHrmsAttendanceRequestModel = z.object({
  expectedUpdatedAt: z.iso
    .datetime()
    .describe("The entry's `updatedAt`; a mismatch is 409 ATTENDANCE_CHANGED."),
});

export type ApproveConstructionHrmsAttendanceRequestModel = z.input<
  typeof ApproveConstructionHrmsAttendanceRequestModel
>;

export const RejectConstructionHrmsAttendanceRequestModel = z.object({
  expectedUpdatedAt: z.iso.datetime(),
  reason: z.string().describe("Why it is rejected; 3–500 characters."),
});

export type RejectConstructionHrmsAttendanceRequestModel = z.input<
  typeof RejectConstructionHrmsAttendanceRequestModel
>;

export const ConstructionHrmsMonthRequestModel = z.object({
  month: z
    .string()
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/)
    .describe("YYYY-MM."),
});

const LocationModel = z.object({
  latitude: z.number(),
  longitude: z.number(),
  accuracyMetres: z.number().nullable(),
});

export const ConstructionHrmsAttendanceEntryResponseModel = z.object({
  id: z.uuid(),
  memberId: z.uuid(),
  date: z.iso.date(),
  checkInAt: z.iso.datetime(),
  checkOutAt: z.iso.datetime().nullable(),
  /** Null while open. */
  hours: z.number().nullable(),
  source: z.enum(ATTENDANCE_SOURCES),
  approvalStatus: z.enum(APPROVAL_STATUSES),
  outOfFence: z.boolean(),
  checkInLocation: LocationModel.nullable(),
  checkInBranchId: z.uuid().nullable(),
  checkOutLocation: LocationModel.nullable(),
  checkOutBranchId: z.uuid().nullable(),
  reason: z.string().nullable(),
  rejectionReason: z.string().nullable(),
  decidedAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export type ConstructionHrmsAttendanceEntryResponseModel = z.infer<
  typeof ConstructionHrmsAttendanceEntryResponseModel
>;

export const ConstructionHrmsAttendanceDayResponseModel = z.object({
  date: z.iso.date(),
  status: z.enum(DAY_STATUSES),
  workedHours: z.number(),
  overtimeHours: z.number(),
  overtimeAllowed: z.boolean(),
  late: z.boolean(),
  leave: z
    .object({
      paid: z.boolean(),
      half: z.boolean(),
      otherHalf: z.enum(["present", "absent"]).nullable(),
    })
    .nullable(),
});

export type ConstructionHrmsAttendanceDayResponseModel = z.infer<
  typeof ConstructionHrmsAttendanceDayResponseModel
>;

const MemberModel = z.object({
  memberId: z.uuid(),
  name: z.string(),
  designationName: z.string().nullable(),
  memberType: z.enum(["normal", "hrms"]),
});

export const GetConstructionHrmsAttendanceTodayResponseModel = z.object({
  today: z.iso.date(),
  timeZone: z.string(),
  member: MemberModel,
  gpsRequirement: z.enum(GPS_REQUIREMENTS),
  /** 0 = "Office location is not configured". */
  fenceCount: z.int(),
  shift: z.object({
    name: z.string(),
    startTime: z.string().nullable(),
    endTime: z.string().nullable(),
    workingHours: z.number(),
    isWorkingDay: z.boolean(),
  }),
  holidayName: z.string().nullable(),
  day: ConstructionHrmsAttendanceDayResponseModel,
  state: z.enum(LIVE_STATES),
  /** Today's entries, by check-in. */
  entries: z.array(ConstructionHrmsAttendanceEntryResponseModel),
  /** The open entry, of any date. */
  openEntry: ConstructionHrmsAttendanceEntryResponseModel.nullable(),
  /** False with an open entry: it was left open on an earlier day (add a missed checkout). */
  openNow: z.boolean(),
  /** The member's entries waiting for approval. */
  pending: z.array(ConstructionHrmsAttendanceEntryResponseModel),
  /** The member may check in and add entries (`create`). */
  canCreate: z.boolean(),
});

export type GetConstructionHrmsAttendanceTodayResponseModel = z.infer<
  typeof GetConstructionHrmsAttendanceTodayResponseModel
>;

export const ListConstructionHrmsAttendanceApprovalsResponseModel = z.object({
  items: z.array(
    z.object({
      entry: ConstructionHrmsAttendanceEntryResponseModel,
      member: MemberModel.nullable(),
    }),
  ),
});

export type ListConstructionHrmsAttendanceApprovalsResponseModel = z.infer<
  typeof ListConstructionHrmsAttendanceApprovalsResponseModel
>;

export const GetConstructionHrmsTeamTodayResponseModel = z.object({
  today: z.iso.date(),
  counts: z.object({
    all: z.int(),
    late: z.int(),
    checked_in: z.int(),
    checked_out: z.int(),
    not_checked_in: z.int(),
    on_leave: z.int(),
    holiday: z.int(),
    week_off: z.int(),
  }),
  items: z.array(
    z.object({
      member: MemberModel,
      state: z.enum(LIVE_STATES),
      late: z.boolean(),
      firstCheckInAt: z.iso.datetime().nullable(),
      lastCheckOutAt: z.iso.datetime().nullable(),
      workedHours: z.number(),
      openFromEarlierDay: z.boolean(),
      outOfFence: z.boolean(),
    }),
  ),
});

export type GetConstructionHrmsTeamTodayResponseModel = z.infer<
  typeof GetConstructionHrmsTeamTodayResponseModel
>;

export const ListConstructionHrmsAttendanceTeamMembersResponseModel = z.object({
  items: z.array(MemberModel),
});

export type ListConstructionHrmsAttendanceTeamMembersResponseModel = z.infer<
  typeof ListConstructionHrmsAttendanceTeamMembersResponseModel
>;

const CountsModel = z.object({
  workingDays: z.number(),
  present: z.number(),
  halfDays: z.number(),
  absent: z.number(),
  paidLeave: z.number(),
  unpaidLeave: z.number(),
  weekOff: z.number(),
  holidays: z.number(),
  late: z.number(),
  workedHours: z.number(),
  overtimeHours: z.number(),
});

export const GetConstructionHrmsAttendanceMonthlySummaryResponseModel =
  z.object({
    month: z.string(),
    today: z.iso.date(),
    rows: z.array(
      z.object({
        member: MemberModel,
        /** Every date of the month; days after today are not counted. */
        days: z.array(ConstructionHrmsAttendanceDayResponseModel),
        counts: CountsModel,
      }),
    ),
  });

export type GetConstructionHrmsAttendanceMonthlySummaryResponseModel = z.infer<
  typeof GetConstructionHrmsAttendanceMonthlySummaryResponseModel
>;

function toLocation(value: GpsFix | null) {
  return value == null
    ? null
    : {
        latitude: value.latitude,
        longitude: value.longitude,
        accuracyMetres: value.accuracyMetres,
      };
}

export function toEntryResponse(
  entry: StoredAttendanceEntry,
): ConstructionHrmsAttendanceEntryResponseModel {
  return {
    id: entry.id,
    memberId: entry.memberId,
    date: entry.date,
    checkInAt: entry.checkInAt.toISOString(),
    checkOutAt: entry.checkOutAt?.toISOString() ?? null,
    hours:
      entry.checkOutAt == null
        ? null
        : hoursBetween(entry.checkInAt, entry.checkOutAt),
    source: entry.source,
    approvalStatus: entry.approvalStatus,
    outOfFence: entry.outOfFence,
    checkInLocation: toLocation(entry.checkIn),
    checkInBranchId: entry.checkInBranchId,
    checkOutLocation: toLocation(entry.checkOut),
    checkOutBranchId: entry.checkOutBranchId,
    reason: entry.reason,
    rejectionReason: entry.rejectionReason,
    decidedAt: entry.decidedAt?.toISOString() ?? null,
    createdAt: entry.createdAt.toISOString(),
    updatedAt: entry.updatedAt.toISOString(),
  };
}

export function toDayResponse(
  day: AttendanceDay,
): ConstructionHrmsAttendanceDayResponseModel {
  return {
    date: day.date,
    status: day.status,
    workedHours: day.workedHours,
    overtimeHours: day.overtimeHours,
    overtimeAllowed: day.overtimeAllowed,
    late: day.late,
    leave: day.leave,
  };
}

export function toMemberResponse(member: HrmsEmployee) {
  return {
    memberId: member.memberId,
    name: member.name,
    designationName: member.designationName,
    memberType: member.memberType,
  };
}

export function toTodayResponse(
  view: TodayView,
): GetConstructionHrmsAttendanceTodayResponseModel {
  return {
    today: view.today,
    timeZone: view.timeZone,
    member: toMemberResponse(view.member),
    gpsRequirement: view.gpsRequirement,
    fenceCount: view.fenceCount,
    shift: {
      name: view.shift.name,
      startTime: view.shift.startTime,
      endTime: view.shift.endTime,
      workingHours: view.shift.workingHours,
      isWorkingDay: view.shift.isWorkingDay,
    },
    holidayName: view.holidayName,
    day: toDayResponse(view.day),
    state: view.state,
    entries: view.entries.map(toEntryResponse),
    openEntry: view.open == null ? null : toEntryResponse(view.open),
    openNow: view.openNow,
    pending: view.pending.map(toEntryResponse),
    canCreate: view.canCreate,
  };
}

export function toApprovalsResponse(
  items: PendingApproval[],
): ListConstructionHrmsAttendanceApprovalsResponseModel {
  return {
    items: items.map((item) => ({
      entry: toEntryResponse(item.entry),
      member: item.member == null ? null : toMemberResponse(item.member),
    })),
  };
}

export function toTeamTodayResponse(
  team: TeamToday,
): GetConstructionHrmsTeamTodayResponseModel {
  return {
    today: team.today,
    counts: team.counts,
    items: team.items.map((item) => ({
      member: toMemberResponse(item.member),
      state: item.state,
      late: item.late,
      firstCheckInAt: item.firstCheckInAt?.toISOString() ?? null,
      lastCheckOutAt: item.lastCheckOutAt?.toISOString() ?? null,
      workedHours: item.workedHours,
      openFromEarlierDay: item.openFromEarlierDay,
      outOfFence: item.outOfFence,
    })),
  };
}

function toCounts(counts: DayCounts) {
  return { ...counts };
}

export function toMonthlySummaryResponse(
  summary: MonthlySummary,
): GetConstructionHrmsAttendanceMonthlySummaryResponseModel {
  return {
    month: summary.month,
    today: summary.today,
    rows: summary.rows.map((row) => ({
      member: toMemberResponse(row.member),
      days: row.days.map(toDayResponse),
      counts: toCounts(row.counts),
    })),
  };
}
