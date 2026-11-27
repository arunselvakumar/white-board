import { z } from "zod";

import { checkInActivityFields } from "@/app/api/construction/labour/_activity/activity-fields";
import type { ActivityPage } from "@/src/composition/labour-activity";
import {
  PROJECT_ACTIVITY_TYPES,
  PROJECT_ACTIVITY_WHO,
  type ProjectActivityEntry,
} from "@/src/composition/project-activity";

const calendarDate = z.iso.date().describe("Calendar date, YYYY-MM-DD.");

export const ListConstructionProjectsProjectActivityRequestModel = z
  .object({
    type: z
      .enum(PROJECT_ACTIVITY_TYPES)
      .default("all")
      .describe(
        "team: Employees added, removed, transferred; check_ins: each Check In and Check Out (Attendance Read on the Project).",
      ),
    who: z
      .enum(PROJECT_ACTIVITY_WHO)
      .default("all")
      .describe(
        "Whose entries, team changes and check-in entries alike; Vendors have check-in entries only.",
      ),
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

const employee = z.object({
  id: z.uuid(),
  /** Kept after the Employee was deleted. */
  name: z.string(),
  /** "Employee Id". */
  employeeCode: z.string().nullable(),
  /** The Employee's Role name (ADR CM-0055); null once the Role was deleted. */
  role: z.string().nullable(),
  /** The viewer may open the Employee's page (Employees Read) and the Employee is not deleted. */
  canOpen: z.boolean(),
});

const base = {
  /** Unique within the feed. */
  id: z.string(),
  /** The day it applies to: a removal's last day. */
  date: calendarDate,
  recordedAt: z.iso.datetime(),
  /** Who recorded it; a removed Team Member keeps their name. */
  by: z.string().nullable(),
};

/** One command's Employees, by name: one entry for a batch. */
const employees = z.array(employee).min(1);
const remark = z.string().nullable();

export const ConstructionProjectsProjectActivityEntryResponseModel =
  z.discriminatedUnion("kind", [
    z.object({
      ...base,
      kind: z.enum(["employee_added", "employee_removed"]),
      employees,
      remark,
    }),
    z.object({
      ...base,
      kind: z.literal("transferred_in"),
      employees,
      /** Where they came from. */
      fromProject: project.nullable(),
      remark,
    }),
    z.object({
      ...base,
      kind: z.literal("transferred_out"),
      employees,
      /** Where they went. */
      toProject: project.nullable(),
      remark,
    }),
    z.object({
      ...base,
      kind: z.literal("check_in"),
      /** Who was checked in or out. */
      person: z.object({
        kind: z.enum(["employee", "vendor"]),
        id: z.uuid(),
        /** Kept after they were deleted. */
        name: z.string(),
        /** An Employee's Role name, or "Vendor". */
        role: z.string().nullable(),
        /** The viewer may open their page (Employees Read; Vendors Read for a Vendor) and they are not deleted. */
        canOpen: z.boolean(),
      }),
      ...checkInActivityFields,
    }),
  ]);

export const ListConstructionProjectsProjectActivityResponseModel = z.object({
  /** Newest effective date first, then the latest recorded. */
  items: z.array(ConstructionProjectsProjectActivityEntryResponseModel),
  /** Send back as `cursor` for the next page; null on the last. */
  nextCursor: z.string().nullable(),
  /** The Company's IANA time zone, for showing recorded times. */
  timeZone: z.string(),
});

export type ListConstructionProjectsProjectActivityResponseModel = z.infer<
  typeof ListConstructionProjectsProjectActivityResponseModel
>;

export function toProjectActivityResponse(
  page: ActivityPage<ProjectActivityEntry>,
): ListConstructionProjectsProjectActivityResponseModel {
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
