import { z } from "zod";

import type { AttendanceRegisterView } from "@/src/training-institute/application/attendance-handlers";
import { ABSENCE_REASONS } from "@/src/training-institute/domain/absence-notice";
import { ATTENDANCE_STATUSES } from "@/src/training-institute/domain/attendance-register";

export const OpenTrainingInstituteAttendanceRegisterRequestModel = z.object({
  batchId: z.uuid(),
  date: z.iso.date().optional(),
});
export const ListTrainingInstituteAttendanceRegistersRequestModel = z
  .object({
    batchId: z.uuid(),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    after: z.string().optional(),
    before: z.string().optional(),
  })
  .refine((value) => value.after == null || value.before == null, {
    message: "Use either after or before cursor.",
  });
export const TrainingInstituteAttendanceRegisterParamsModel = z.object({
  id: z.uuid(),
});
/** The Absence Notice flag on a mark (RegisterNoticeView, ADR-0041). */
export const TrainingInstituteAttendanceRegisterNoticeResponseModel = z.object({
  noticeId: z.uuid(),
  reason: z.enum(ABSENCE_REASONS),
  note: z.string().nullable(),
  givenAt: z.iso.datetime(),
  givenBy: z.object({
    role: z.enum(["student", "parent"]),
    name: z.string(),
  }),
});
export const TrainingInstituteAttendanceMarkResponseModel = z.object({
  id: z.uuid(),
  enrollmentId: z.uuid(),
  studentId: z.uuid(),
  studentName: z.string(),
  status: z.enum(ATTENDANCE_STATUSES),
  note: z.string().nullable(),
  markedByUserId: z.string().nullable(),
  markedAt: z.iso.datetime().nullable(),
  /** A live Absence Notice for one of the day's Classes that still applies. */
  notice: TrainingInstituteAttendanceRegisterNoticeResponseModel.nullable(),
});
export const TrainingInstituteAttendanceSummaryResponseModel = z.object({
  total: z.number().int(),
  unmarked: z.number().int(),
  present: z.number().int(),
  /** Uninformed absences. */
  absent: z.number().int(),
  /** Absences after an Absence Notice; never counted as attended. */
  informedAbsent: z.number().int(),
  late: z.number().int(),
  excused: z.number().int(),
  attended: z.number().int(),
  complete: z.boolean(),
});
export const TrainingInstituteAttendanceRegisterResponseModel = z.object({
  id: z.uuid(),
  batchId: z.uuid(),
  date: z.iso.date(),
  timezone: z.string(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  summary: TrainingInstituteAttendanceSummaryResponseModel,
  marks: z.array(TrainingInstituteAttendanceMarkResponseModel),
});
export const ListTrainingInstituteAttendanceRegistersResponseModel = z.object({
  items: z.array(TrainingInstituteAttendanceRegisterResponseModel),
  total: z.number().int(),
  nextCursor: z.string().nullable(),
  prevCursor: z.string().nullable(),
});

export function mapAttendanceRegister({
  register,
  notices,
}: AttendanceRegisterView): z.infer<
  typeof TrainingInstituteAttendanceRegisterResponseModel
> {
  return {
    id: register.id,
    batchId: register.batchId,
    date: register.date,
    timezone: register.timezone,
    createdAt: register.createdAt.toISOString(),
    updatedAt: register.updatedAt.toISOString(),
    summary: register.summary,
    marks: register.marks.map((mark) => ({
      id: mark.id,
      enrollmentId: mark.enrollmentId,
      studentId: mark.studentId,
      studentName: mark.studentName,
      status: mark.status,
      note: mark.note,
      markedByUserId: mark.markedByUserId,
      markedAt: mark.markedAt?.toISOString() ?? null,
      notice: notices.get(mark.enrollmentId) ?? null,
    })),
  };
}
