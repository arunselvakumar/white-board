import { z } from "zod";

export const SaveAttendanceMarksRequestModel = z.object({
  marks: z
    .array(
      z.object({
        enrollmentId: z.uuid(),
        status: z.enum(["unmarked", "present", "absent", "late", "excused"]),
        note: z.string().max(500).nullable().optional(),
      }),
    )
    .min(1)
    .max(1000),
});
