// HTTP models for Absence Notices (ADR-0041). Response models mirror
// src/training-institute/application/absence-notice-views.ts exactly.

import { z } from "zod";

import {
  ABSENCE_NOTE_MAX,
  ABSENCE_NOTICE_MAX_CLASSES,
  ABSENCE_REASONS,
} from "@/src/training-institute/domain/absence-notice";

const Id = z.uuid();
const CalendarDate = z.iso.date();
const Clock = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:mm.");
const Reason = z.enum(ABSENCE_REASONS);

export const TrainingInstituteAbsenceNoticeIdParamsModel = z.object({
  id: Id,
});

export const TrainingInstituteClassSlotTimeModel = z.object({
  date: CalendarDate,
  startTime: z.string(),
  endTime: z.string(),
});

export const TrainingInstituteAbsenceGivenByModel = z.object({
  role: z.enum(["student", "parent"]),
  name: z.string(),
});

export const TrainingInstituteNoticeClassModel = z.object({
  enrollmentId: Id,
  batchId: Id,
  batchName: z.string(),
  courseName: z.string(),
  classMode: z.enum(["offline", "online", "hybrid"]),
  timezone: z.string(),
  date: CalendarDate,
  startTime: z.string(),
  endTime: z.string(),
  rescheduled: z.boolean(),
});

export const TrainingInstituteAbsenceNoticeClassesResponseModel = z.object({
  students: z.array(
    z.object({
      id: Id,
      name: z.string(),
      classes: z.array(
        TrainingInstituteNoticeClassModel.extend({
          noticeId: Id.nullable(),
        }),
      ),
    }),
  ),
});
export type TrainingInstituteAbsenceNoticeClassesResponseModel = z.infer<
  typeof TrainingInstituteAbsenceNoticeClassesResponseModel
>;

export const GiveTrainingInstituteAbsenceNoticeRequestModel = z.object({
  studentId: Id,
  classes: z
    .array(z.object({ enrollmentId: Id, date: CalendarDate, startTime: Clock }))
    .min(1)
    .max(ABSENCE_NOTICE_MAX_CLASSES),
  reason: Reason,
  note: z.string().max(ABSENCE_NOTE_MAX).nullish(),
});

export const TrainingInstituteFamilyAbsenceNoticeModel = z.object({
  id: Id,
  studentId: Id,
  studentName: z.string(),
  class: TrainingInstituteNoticeClassModel,
  reason: Reason,
  note: z.string().nullable(),
  givenAt: z.iso.datetime(),
  givenBy: TrainingInstituteAbsenceGivenByModel,
  standing: z.enum([
    "applies",
    "cancelled",
    "holiday",
    "moved",
    "not_scheduled",
  ]),
  movedTo: TrainingInstituteClassSlotTimeModel.nullable(),
  canWithdraw: z.boolean(),
});
export type TrainingInstituteFamilyAbsenceNoticeModel = z.infer<
  typeof TrainingInstituteFamilyAbsenceNoticeModel
>;

export const GiveTrainingInstituteAbsenceNoticeResponseModel = z.object({
  notices: z.array(TrainingInstituteFamilyAbsenceNoticeModel),
});
export type GiveTrainingInstituteAbsenceNoticeResponseModel = z.infer<
  typeof GiveTrainingInstituteAbsenceNoticeResponseModel
>;

export const TrainingInstituteFamilyAbsenceNoticesResponseModel = z.object({
  students: z.array(
    z.object({
      id: Id,
      name: z.string(),
      notices: z.array(TrainingInstituteFamilyAbsenceNoticeModel),
    }),
  ),
});
export type TrainingInstituteFamilyAbsenceNoticesResponseModel = z.infer<
  typeof TrainingInstituteFamilyAbsenceNoticesResponseModel
>;

export const TrainingInstituteExpectedAbsencesResponseModel = z.object({
  classes: z.array(
    z.object({
      batchId: Id,
      batchName: z.string(),
      courseName: z.string(),
      timezone: z.string(),
      date: CalendarDate,
      startTime: z.string(),
      endTime: z.string(),
      rescheduled: z.boolean(),
      absentees: z.array(
        z.object({
          noticeId: Id,
          studentId: Id,
          studentName: z.string(),
          reason: Reason,
          note: z.string().nullable(),
          givenAt: z.iso.datetime(),
          givenBy: TrainingInstituteAbsenceGivenByModel,
        }),
      ),
    }),
  ),
});
export type TrainingInstituteExpectedAbsencesResponseModel = z.infer<
  typeof TrainingInstituteExpectedAbsencesResponseModel
>;
