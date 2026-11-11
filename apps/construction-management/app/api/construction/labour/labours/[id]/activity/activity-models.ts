import { z } from "zod";

import {
  LABOUR_ACTIVITY_TYPES,
  type ActivityPage,
  type LabourActivityEntry,
} from "@/src/composition/labour-activity";

const calendarDate = z.iso.date().describe("Calendar date, YYYY-MM-DD.");

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

export const ListConstructionLabourLabourActivityRequestModel = z
  .object({
    type: z
      .enum(LABOUR_ACTIVITY_TYPES)
      .default("all")
      .describe(
        "projects: added to, removed from, transferred; attendance: the days and their changes; profile: added to Labours, marked inactive or active.",
      ),
    /** Only entries about this Project. */
    projectId: z.uuid().optional(),
    /** Effective dates, inclusive. */
    from: calendarDate.optional(),
    to: calendarDate.optional(),
    /** `nextCursor` of the page before. */
    cursor: z.string().min(1).max(200).optional(),
  })
  .refine(
    (value) => value.from == null || value.to == null || value.from <= value.to,
    { message: "From must be on or before To.", path: ["to"] },
  );

const project = z.object({
  id: z.uuid(),
  /** Kept after the Project was deleted ("Deleted Project" when its row is gone). */
  name: z.string(),
  /** Live, and the viewer is on it (or is the Owner). */
  canOpen: z.boolean(),
});

const base = {
  /** Unique within the feed. */
  id: z.string(),
  /** The day it applies to: a removal's last day, a transfer's first day on the new Project. */
  date: calendarDate,
  recordedAt: z.iso.datetime(),
  /** Who recorded it; a removed Team Member keeps their name. */
  by: z.string().nullable(),
};

const remark = z.string().nullable();

export const ConstructionLabourLabourActivityEntryResponseModel =
  z.discriminatedUnion("kind", [
    z.object({
      ...base,
      kind: z.literal("added"),
      /** Added by an Excel import. */
      imported: z.boolean(),
    }),
    z.object({ ...base, kind: z.enum(["activated", "deactivated"]) }),
    z.object({
      ...base,
      kind: z.enum(["project_added", "project_removed"]),
      project,
      remark,
    }),
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
  ]);

export const ListConstructionLabourLabourActivityResponseModel = z.object({
  /** Newest effective date first, then the latest recorded. */
  items: z.array(ConstructionLabourLabourActivityEntryResponseModel),
  /** Send back as `cursor` for the next page; null on the last. */
  nextCursor: z.string().nullable(),
  /** The Company's IANA time zone, for showing recorded times. */
  timeZone: z.string(),
});

export type ListConstructionLabourLabourActivityResponseModel = z.infer<
  typeof ListConstructionLabourLabourActivityResponseModel
>;

export function toLabourActivityResponse(
  page: ActivityPage<LabourActivityEntry>,
): ListConstructionLabourLabourActivityResponseModel {
  return {
    items: page.items.map((entry) => ({
      ...entry,
      recordedAt: entry.recordedAt.toISOString(),
    })),
    nextCursor: page.nextCursor,
    timeZone: page.timeZone,
  };
}
