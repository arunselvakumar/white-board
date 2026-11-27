import { z } from "zod";

import type { ActivityPage } from "@/src/composition/labour-activity";
import type { PersonActivityEntry } from "@/src/composition/person-activity";

// The parts of the Activity feeds' models (ADR CM-0038, CM-0044) shared by
// the Project feed and a Vendor's feed, so neither reads the Employee
// record's own models (ADR CM-0055).

export const activityCalendarDate = z.iso
  .date()
  .describe("Calendar date, YYYY-MM-DD.");

/** A person's feed's query besides `type`. */
export const personActivityQueryFields = {
  /** Only entries about this Project. */
  projectId: z.uuid().optional(),
  /** Effective dates, inclusive. */
  from: activityCalendarDate.optional(),
  to: activityCalendarDate.optional(),
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

export const activityProject = z.object({
  id: z.uuid(),
  /** Kept after the Project was deleted ("Deleted Project" when its row is gone). */
  name: z.string(),
  /** Live, and the viewer is on it (or is the Owner). */
  canOpen: z.boolean(),
});

const base = {
  /** Unique within the feed. */
  id: z.string(),
  /** The day it applies to: a removal's last day. */
  date: activityCalendarDate,
  recordedAt: z.iso.datetime(),
  /** Who recorded it; a removed Team Member keeps their name. */
  by: z.string().nullable(),
};

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

/** Added to or removed from a Project. */
const projectChangeActivityEntry = z.object({
  ...base,
  kind: z.enum(["project_added", "project_removed"]),
  project: activityProject,
  /** Always null in a Vendor's feed. */
  remark: z.string().nullable(),
});

/** One Check In or Check Out. */
const checkInActivityEntry = z.object({
  ...base,
  kind: z.literal("check_in"),
  project: activityProject,
  ...checkInActivityFields,
});

/** A Vendor's entry (ADR CM-0044 §7). */
const vendorActivityEntry = z.discriminatedUnion("kind", [
  projectChangeActivityEntry,
  checkInActivityEntry,
]);

/** One page of a Vendor's feed. */
export const vendorActivityPageModel = z.object({
  /** Newest effective date first, then the latest recorded. */
  items: z.array(vendorActivityEntry),
  /** Send back as `cursor` for the next page; null on the last. */
  nextCursor: z.string().nullable(),
  /** The Company's IANA time zone, for showing recorded times. */
  timeZone: z.string(),
});

export type VendorActivityPageResponse = z.infer<
  typeof vendorActivityPageModel
>;

export function toVendorActivityResponse(
  page: ActivityPage<PersonActivityEntry>,
): VendorActivityPageResponse {
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
