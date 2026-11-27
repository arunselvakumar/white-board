import { z } from "zod";

import {
  DATES_IN_ORDER,
  activityEntryBase as base,
  activityProject as project,
  activityRemark as remark,
  checkInActivityEntry,
  datesInOrder,
  personActivityQueryFields,
  projectChangeActivityEntry,
} from "@/app/api/_lib/person-activity-models";
import {
  LABOUR_ACTIVITY_TYPES,
  type ActivityPage,
  type LabourActivityEntry,
} from "@/src/composition/labour-activity";

const ATTENDANCE_LABELS = [
  "present",
  "half_day",
  "absent",
  "on_leave",
  "paid_leave",
  "holiday",
] as const;

const status = z
  .enum(ATTENDANCE_LABELS)
  .describe(
    "As on the attendance sheet: Present, Half Day, Absent, On Leave, Paid Leave (On Leave that is paid), Holiday.",
  );

export const ListConstructionLabourEmployeeActivityRequestModel = z
  .object({
    type: z
      .enum(LABOUR_ACTIVITY_TYPES)
      .default("all")
      .describe(
        "projects: added to, removed from, transferred; attendance: the days and their changes; check_ins: each Check In and Check Out (Attendance Read on the Project); profile: added to Employees, marked inactive or active.",
      ),
    ...personActivityQueryFields,
  })
  .refine(datesInOrder, DATES_IN_ORDER);

export const ConstructionLabourEmployeeActivityEntryResponseModel =
  z.discriminatedUnion("kind", [
    z.object({
      ...base,
      kind: z.literal("added"),
      /** Added by an Excel import. */
      imported: z.boolean(),
    }),
    z.object({ ...base, kind: z.enum(["activated", "deactivated"]) }),
    projectChangeActivityEntry,
    z.object({
      ...base,
      kind: z.literal("transferred"),
      fromProject: project,
      toProject: project,
      remark,
    }),
    z.object({
      ...base,
      kind: z.literal("attendance"),
      project,
      status,
      shift: z.string().nullable(),
      /** `HH:MM`, Company time. */
      checkIn: z.string().nullable(),
      /** `HH:MM`; at or before check-in means the next day. */
      checkOut: z.string().nullable(),
      /** Decimal hours; null without overtime. No amounts are returned. */
      overtimeHours: z.string().nullable(),
    }),
    z.object({
      ...base,
      kind: z.literal("attendance_changed"),
      project,
      fromStatus: status,
      toStatus: status,
    }),
    z.object({
      ...base,
      kind: z.literal("attendance_cleared"),
      project,
      /** What the day was before it was cleared. */
      status,
    }),
    checkInActivityEntry,
  ]);

export const ListConstructionLabourEmployeeActivityResponseModel = z.object({
  /** Newest effective date first, then the latest recorded. */
  items: z.array(ConstructionLabourEmployeeActivityEntryResponseModel),
  /** Send back as `cursor` for the next page; null on the last. */
  nextCursor: z.string().nullable(),
  /** The Company's IANA time zone, for showing recorded times. */
  timeZone: z.string(),
});

export type ListConstructionLabourEmployeeActivityResponseModel = z.infer<
  typeof ListConstructionLabourEmployeeActivityResponseModel
>;

export function toEmployeeActivityResponse(
  page: ActivityPage<LabourActivityEntry>,
): ListConstructionLabourEmployeeActivityResponseModel {
  return {
    items: page.items.map((entry) =>
      entry.kind === "check_in"
        ? {
            ...entry,
            at: entry.at.toISOString(),
            recordedAt: entry.recordedAt.toISOString(),
          }
        : { ...entry, recordedAt: entry.recordedAt.toISOString() },
    ),
    nextCursor: page.nextCursor,
    timeZone: page.timeZone,
  };
}
