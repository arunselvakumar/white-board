import { z } from "zod";

import type { AttendanceRegister } from "@/src/training-institute/domain/attendance-register";

export const OpenAttendanceRegisterRequestModel = z.object({
  batchId: z.uuid(),
  date: z.iso.date().optional(),
});
export const ListAttendanceRegistersRequestModel = z
  .object({
    batchId: z.uuid(),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    after: z.string().optional(),
    before: z.string().optional(),
  })
  .refine((value) => value.after == null || value.before == null, {
    message: "Use either after or before cursor.",
  });
export const AttendanceRegisterParamsModel = z.object({ id: z.uuid() });
export const AttendanceMarkResponseModel = z.object({
  id: z.uuid(),
  enrollmentId: z.uuid(),
  studentId: z.uuid(),
  studentName: z.string(),
  status: z.enum(["unmarked", "present", "absent", "late", "excused"]),
  note: z.string().nullable(),
  markedByUserId: z.string().nullable(),
  markedAt: z.iso.datetime().nullable(),
});
export const AttendanceSummaryResponseModel = z.object({
  total: z.number().int(),
  unmarked: z.number().int(),
  present: z.number().int(),
  absent: z.number().int(),
  late: z.number().int(),
  excused: z.number().int(),
  attended: z.number().int(),
  complete: z.boolean(),
});
export const AttendanceRegisterResponseModel = z.object({
  id: z.uuid(),
  batchId: z.uuid(),
  date: z.iso.date(),
  timezone: z.string(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  summary: AttendanceSummaryResponseModel,
  marks: z.array(AttendanceMarkResponseModel),
});
export const ListAttendanceRegistersResponseModel = z.object({
  items: z.array(AttendanceRegisterResponseModel),
  total: z.number().int(),
  nextCursor: z.string().nullable(),
  prevCursor: z.string().nullable(),
});

export function mapAttendanceRegister(
  register: AttendanceRegister,
): z.infer<typeof AttendanceRegisterResponseModel> {
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
    })),
  };
}
