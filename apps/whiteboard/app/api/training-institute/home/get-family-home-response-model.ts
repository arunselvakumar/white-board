import { z } from "zod";

const ClassModeModel = z.enum(["offline", "online", "hybrid"]);
const DateModel = z.iso.date();

export const TrainingInstituteFamilyHomeStudentModel = z.object({
  id: z.uuid(),
  name: z.string(),
  nextClass: z
    .object({
      enrollmentId: z.uuid(),
      batchId: z.uuid(),
      batchName: z.string(),
      courseName: z.string(),
      classMode: ClassModeModel,
      room: z.string().nullable(),
      timezone: z.string(),
      date: DateModel,
      startTime: z.string(),
      endTime: z.string(),
      rescheduled: z.boolean(),
      inProgress: z.boolean(),
    })
    .nullable(),
  dues: z.array(
    z.object({
      enrollmentId: z.uuid(),
      batchName: z.string(),
      courseName: z.string(),
      feePlanPaise: z.number().int(),
      paidPaise: z.number().int(),
      remainingDuesPaise: z.number().int(),
    }),
  ),
  recentAttendance: z.array(
    z.object({
      date: DateModel,
      batchName: z.string(),
      courseName: z.string(),
      status: z.enum(["present", "absent", "late", "excused"]),
    }),
  ),
  recordings: z.array(
    z.object({
      batchId: z.uuid(),
      batchName: z.string(),
      courseName: z.string(),
      date: DateModel,
      startTime: z.string(),
      endTime: z.string(),
    }),
  ),
});

export const GetTrainingInstituteFamilyHomeResponseModel = z.object({
  students: z.array(TrainingInstituteFamilyHomeStudentModel),
});
export type GetTrainingInstituteFamilyHomeResponseModel = z.infer<
  typeof GetTrainingInstituteFamilyHomeResponseModel
>;
