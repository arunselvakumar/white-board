import type {
  LabourActivityEntry,
  LabourActivityPage,
} from "@/src/queries/activity";

import { TOWER, VILLA } from "../../_components/labour-fixtures";

/** What "Today" is in the stories: 11 Nov 2026, noon in India. */
export const STORY_NOW = new Date("2026-11-11T06:30:00Z");

const tower = { ...TOWER, canOpen: true };
const villa = { ...VILLA, canOpen: true };
const by = "Arun Selva Kumar";

function at(date: string, time = "10:15"): string {
  // India is UTC+5:30.
  return new Date(`${date}T${time}:00+05:30`).toISOString();
}

/** One of each kind, newest first. */
export const MIXED_ENTRIES: LabourActivityEntry[] = [
  {
    id: "deactivated:1",
    kind: "deactivated",
    date: "2026-11-11",
    recordedAt: at("2026-11-11", "11:40"),
    by,
  },
  {
    id: "project_removed:1",
    kind: "project_removed",
    date: "2026-11-10",
    recordedAt: at("2026-11-11", "11:30"),
    by,
    project: villa,
    remark: "Work finished",
  },
  {
    id: "attendance:2",
    kind: "attendance",
    date: "2026-11-10",
    recordedAt: at("2026-11-10", "18:20"),
    by: "Karthik Raja",
    project: villa,
    status: "present",
    shift: "Shift 1",
    checkIn: "09:00",
    checkOut: "18:00",
    overtimeHours: "1.5",
  },
  {
    id: "attendance_changed:1",
    kind: "attendance_changed",
    date: "2026-11-09",
    recordedAt: at("2026-11-10", "09:05"),
    by,
    project: villa,
    fromStatus: "absent",
    toStatus: "half_day",
  },
  {
    id: "attendance:1",
    kind: "attendance",
    date: "2026-11-09",
    recordedAt: at("2026-11-09", "18:00"),
    by: "Karthik Raja",
    project: villa,
    status: "half_day",
    shift: null,
    checkIn: null,
    checkOut: null,
    overtimeHours: null,
  },
  {
    id: "attendance_cleared:1",
    kind: "attendance_cleared",
    date: "2026-11-08",
    recordedAt: at("2026-11-08", "19:00"),
    by,
    project: villa,
    status: "present",
  },
  {
    id: "transferred:1",
    kind: "transferred",
    date: "2026-11-01",
    recordedAt: at("2026-11-05"),
    by,
    fromProject: tower,
    toProject: villa,
    remark: "Slab casting",
  },
  {
    id: "attendance:0",
    kind: "attendance",
    date: "2026-10-20",
    recordedAt: at("2026-10-20", "18:00"),
    by: "Karthik Raja",
    project: {
      id: "0199a1b2-0000-7000-8000-00000000a009",
      name: "Old Mall",
      canOpen: false,
    },
    status: "paid_leave",
    shift: null,
    checkIn: null,
    checkOut: null,
    overtimeHours: null,
  },
  {
    id: "project_added:1",
    kind: "project_added",
    date: "2026-09-01",
    recordedAt: at("2026-09-01"),
    by,
    project: tower,
    remark: null,
  },
  {
    id: "added:1",
    kind: "added",
    date: "2026-09-01",
    recordedAt: at("2026-09-01"),
    by,
    imported: true,
  },
];

export function activityPage(
  items: LabourActivityEntry[],
  nextCursor: string | null = null,
): LabourActivityPage {
  return { items, nextCursor, timeZone: "Asia/Kolkata" };
}

/** `count` attendance days back from 10 Nov 2026, newest first. */
export function attendanceDays(
  count: number,
  offset = 0,
): LabourActivityEntry[] {
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(Date.UTC(2026, 10, 10 - offset - index))
      .toISOString()
      .slice(0, 10);
    return {
      id: `attendance:${String(offset + index)}`,
      kind: "attendance" as const,
      date,
      recordedAt: at(date, "18:00"),
      by: "Karthik Raja",
      project: tower,
      status: "present" as const,
      shift: null,
      checkIn: "09:00",
      checkOut: "17:30",
      overtimeHours: null,
    };
  });
}
