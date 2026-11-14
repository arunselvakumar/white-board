import { z } from "zod";

import {
  LABOUR_ACTIVITY_TYPES,
  type ActivityPage,
  type LabourActivityEntry,
} from "@/src/composition/labour-activity";
import type { PersonActivityEntry } from "@/src/composition/person-activity";

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

/** A person's feed's query besides `type`: the Labour's, a Site Engineer's, a Vendor's. */
export const personActivityQueryFields = {
  /** Only entries about this Project. */
  projectId: z.uuid().optional(),
  /** Effective dates, inclusive. */
  from: calendarDate.optional(),
  to: calendarDate.optional(),
  /** `nextCursor` of the page before. */
  cursor: z.string().min(1).max(200).optional(),
};

export function datesInOrder(value: {
  from?: string | undefined;
  to?: string | undefined;
}): boolean {
  return value.from == null || value.to == null || value.from <= value.to;
}

export const DATES_IN_ORDER = {
  message: "From must be on or before To.",
  path: ["to"],
};

export const ListConstructionLabourLabourActivityRequestModel = z
  .object({
    type: z
      .enum(LABOUR_ACTIVITY_TYPES)
      .default("all")
      .describe(
        "projects: added to, removed from, transferred; attendance: the days and their changes; check_ins: each Check In and Check Out (Attendance Read on the Project); profile: added to Labours, marked inactive or active.",
      ),
    ...personActivityQueryFields,
  })
  .refine(datesInOrder, DATES_IN_ORDER);

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

/** A check-in entry's own fields (ADR CM-0044 §2); no amounts. */
export const checkInActivityFields = {
  action: z.enum(["check_in", "check_out"]),
  /** When it happened; the same instant as `recordedAt`. */
  at: z.iso.datetime(),
  /** The check-in entry: its photo is `/api/construction/labour/attendance/check-ins/{entryId}/photo`. */
  entryId: z.uuid(),
  /** False once the photo was removed (90 days). */
  hasPhoto: z.boolean(),
  location: z
    .object({
      latitude: z.number(),
      longitude: z.number(),
      /** Metres, as the device reported it. */
      accuracyMetres: z.number().nullable(),
    })
    .nullable(),
  /** Against the Project's Site fence; null without a location or a fence. */
  fence: z.enum(["inside", "outside"]).nullable(),
  /** Set with `fence`; 0 inside. */
  metresOutside: z.number().int().nullable(),
  /** A voided entry stays in the feed, struck through. */
  voided: z.object({ reason: z.string() }).nullable(),
};

/** Added to or removed from a Project; in every person's feed. */
export const projectChangeActivityEntry = z.object({
  ...base,
  kind: z.enum(["project_added", "project_removed"]),
  project,
  /** Null in a Site Engineer's and a Vendor's feed. */
  remark,
});

/** One Check In or Check Out; in every person's feed. */
export const checkInActivityEntry = z.object({
  ...base,
  kind: z.literal("check_in"),
  project,
  ...checkInActivityFields,
});

export const ConstructionLabourLabourActivityEntryResponseModel =
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

/** A Site Engineer's or a Vendor's entry (ADR CM-0044 §7). */
export const personActivityEntry = z.discriminatedUnion("kind", [
  projectChangeActivityEntry,
  checkInActivityEntry,
]);

/** One page of a Site Engineer's or a Vendor's feed. */
export function personActivityPageModel() {
  return z.object({
    /** Newest effective date first, then the latest recorded. */
    items: z.array(personActivityEntry),
    /** Send back as `cursor` for the next page; null on the last. */
    nextCursor: z.string().nullable(),
    /** The Company's IANA time zone, for showing recorded times. */
    timeZone: z.string(),
  });
}

export type PersonActivityPageResponse = z.infer<
  ReturnType<typeof personActivityPageModel>
>;

export function toPersonActivityResponse(
  page: ActivityPage<PersonActivityEntry>,
): PersonActivityPageResponse {
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
