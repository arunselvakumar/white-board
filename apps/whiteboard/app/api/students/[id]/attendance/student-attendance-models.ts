import { z } from "zod";

export const StudentAttendanceParamsModel = z.object({ id: z.uuid() });
export const ListStudentAttendanceRequestModel = z
  .object({
    limit: z.coerce.number().int().min(1).max(100).default(20),
    after: z.string().optional(),
    before: z.string().optional(),
  })
  .refine((value) => value.after == null || value.before == null, {
    message: "Use either after or before cursor.",
  });
export const StudentAttendanceHistoryResponseModel = z.object({
  items: z.array(
    z.object({
      id: z.uuid(),
      registerId: z.uuid(),
      batchId: z.uuid(),
      batchName: z.string(),
      date: z.iso.date(),
      status: z.enum(["unmarked", "present", "absent", "late", "excused"]),
      note: z.string().nullable(),
    }),
  ),
  total: z.number().int(),
  nextCursor: z.string().nullable(),
  prevCursor: z.string().nullable(),
});
