// Story fixtures for the Student and Parent Absence Notice card and picker.
// "Today" is Wed, 14 Oct 2026 in Asia/Kolkata. Python Evening meets Mon, Wed,
// and Fri at 18:00; Tally Morning meets Tue and Sat at 10:00.

import type {
  FamilyAbsenceNoticeView,
  PickableClassView,
} from "@/src/queries/absence-notices";

/** 2026-10-14 09:00 in Asia/Kolkata. */
export const NOTICE_NOW = new Date("2026-10-14T03:30:00.000Z");

export const ASHA_ID = "880e8400-e29b-41d4-a716-446655440000";
export const RAVI_ID = "770e8400-e29b-41d4-a716-446655440000";
const PYTHON_BATCH_ID = "660e8400-e29b-41d4-a716-446655440000";
const TALLY_BATCH_ID = "440e8400-e29b-41d4-a716-446655440000";
const ASHA_PYTHON = "990e8400-e29b-41d4-a716-446655440001";
const ASHA_TALLY = "990e8400-e29b-41d4-a716-446655440002";
const RAVI_TALLY = "550e8400-e29b-41d4-a716-446655440003";

const python = {
  batchId: PYTHON_BATCH_ID,
  batchName: "Python Evening",
  courseName: "Python",
  classMode: "online",
  timezone: "Asia/Kolkata",
  startTime: "18:00",
  endTime: "19:00",
  rescheduled: false,
} as const;

const tally = {
  batchId: TALLY_BATCH_ID,
  batchName: "Tally Morning",
  courseName: "Tally",
  classMode: "offline",
  timezone: "Asia/Kolkata",
  startTime: "10:00",
  endTime: "11:00",
  rescheduled: false,
} as const;

const givenAt = new Date("2026-10-12T05:00:00.000Z").toISOString();

/** Given by a Parent for Friday's Python Class; still applies. */
export const travelNotice: FamilyAbsenceNoticeView = {
  id: "a10e8400-e29b-41d4-a716-446655440001",
  studentId: ASHA_ID,
  studentName: "Asha Kumar",
  class: { ...python, enrollmentId: ASHA_PYTHON, date: "2026-10-16" },
  reason: "travel",
  note: "Cousin’s wedding in Madurai.",
  givenAt,
  givenBy: { role: "parent", name: "Ramesh Kumar" },
  standing: "applies",
  movedTo: null,
  canWithdraw: true,
};

/** Given by the Student; the Class was cancelled afterwards. */
export const cancelledNotice: FamilyAbsenceNoticeView = {
  id: "a10e8400-e29b-41d4-a716-446655440002",
  studentId: ASHA_ID,
  studentName: "Asha Kumar",
  class: { ...python, enrollmentId: ASHA_PYTHON, date: "2026-10-19" },
  reason: "exam",
  note: null,
  givenAt,
  givenBy: { role: "student", name: "Asha Kumar" },
  standing: "cancelled",
  movedTo: null,
  canWithdraw: true,
};

/** The Class moved to Thursday after notice; give notice again for it. */
export const movedNotice: FamilyAbsenceNoticeView = {
  id: "a10e8400-e29b-41d4-a716-446655440003",
  studentId: ASHA_ID,
  studentName: "Asha Kumar",
  class: { ...python, enrollmentId: ASHA_PYTHON, date: "2026-10-21" },
  reason: "sick",
  note: null,
  givenAt,
  givenBy: { role: "parent", name: "Lakshmi Kumar" },
  standing: "moved",
  movedTo: { date: "2026-10-22", startTime: "17:00", endTime: "18:00" },
  canWithdraw: true,
};

/** A Holiday was declared over the Class. */
export const holidayNotice: FamilyAbsenceNoticeView = {
  id: "a10e8400-e29b-41d4-a716-446655440004",
  studentId: ASHA_ID,
  studentName: "Asha Kumar",
  class: { ...tally, enrollmentId: ASHA_TALLY, date: "2026-10-20" },
  reason: "family",
  note: null,
  givenAt,
  givenBy: { role: "student", name: "Asha Kumar" },
  standing: "holiday",
  movedTo: null,
  canWithdraw: true,
};

/** Today's Class has started, so the notice can no longer be withdrawn. */
export const startedNotice: FamilyAbsenceNoticeView = {
  id: "a10e8400-e29b-41d4-a716-446655440005",
  studentId: ASHA_ID,
  studentName: "Asha Kumar",
  class: { ...tally, enrollmentId: ASHA_TALLY, date: "2026-10-14" },
  reason: "other",
  note: null,
  givenAt,
  givenBy: { role: "student", name: "Asha Kumar" },
  standing: "applies",
  movedTo: null,
  canWithdraw: false,
};

const pick = (
  base: typeof python | typeof tally,
  enrollmentId: string,
  date: string,
  extra: Partial<PickableClassView> = {},
): PickableClassView => ({
  ...base,
  enrollmentId,
  date,
  noticeId: null,
  ...extra,
});

/** Asha's next Classes in two Batches; Friday's Python already has notice. */
export const ashaClasses: PickableClassView[] = [
  pick(python, ASHA_PYTHON, "2026-10-14"),
  pick(python, ASHA_PYTHON, "2026-10-16", { noticeId: travelNotice.id }),
  pick(tally, ASHA_TALLY, "2026-10-17"),
  pick(python, ASHA_PYTHON, "2026-10-22", {
    startTime: "17:00",
    endTime: "18:00",
    rescheduled: true,
  }),
  pick(python, ASHA_PYTHON, "2026-10-23"),
];

/** Ravi has one Batch, so the picker doesn't repeat its name. */
export const raviClasses: PickableClassView[] = [
  pick(tally, RAVI_TALLY, "2026-10-17"),
  pick(tally, RAVI_TALLY, "2026-10-24"),
  pick(tally, RAVI_TALLY, "2026-10-27"),
];
