import { z } from "zod";

import { ATTENDANCE_STATUSES } from "@/src/training-institute/domain/attendance-register";

export const SaveTrainingInstituteAttendanceMarksRequestModel = z.object({
  marks: z
    .array(
      z.object({
        enrollmentId: z.uuid(),
        status: z.enum(ATTENDANCE_STATUSES),
        note: z.string().max(500).nullable().optional(),
      }),
    )
    .min(1)
    .max(1000),
});
