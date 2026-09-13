import { z } from "zod";

import { studentResponseFields } from "./student-response-fields";

export const StudentEnrollmentSummaryModel = z.object({
  id: z.uuid(),
  courseId: z.uuid(),
  batchId: z.uuid(),
  classModeOverride: z.enum(["offline", "online", "hybrid"]).nullable(),
  timingSource: z.enum(["batch", "student"]),
  endedAt: z.iso.datetime().nullable(),
  feePlanAmountPaise: z.number().int(),
  remainingDuesPaise: z.number().int(),
});

export const GetStudentResponseModel = z.object({
  ...studentResponseFields,
  enrollments: z.array(StudentEnrollmentSummaryModel),
});

export type GetStudentResponseModel = z.infer<typeof GetStudentResponseModel>;
