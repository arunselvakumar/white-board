import { z } from "zod";

export const AssignTrainingInstituteTeacherBatchRequestModel = z.object({
  batchId: z.uuid(),
});
export const TrainingInstituteAssignedBatchResponseModel = z.object({
  id: z.uuid(),
  name: z.string(),
  courseId: z.uuid(),
  classMode: z.string(),
  timings: z.unknown(),
  timezone: z.string(),
  room: z.string().nullable(),
  assignedAt: z.iso.datetime(),
});
export const TrainingInstituteTeacherBatchesResponseModel = z.object({
  items: z.array(TrainingInstituteAssignedBatchResponseModel),
});

export function mapAssignedBatches(
  items: {
    id: string;
    name: string;
    courseId: string;
    classMode: string;
    timings: unknown;
    timezone: string;
    room: string | null;
    assignedAt: Date;
  }[],
) {
  return {
    items: items.map((item) => ({
      ...item,
      assignedAt: item.assignedAt.toISOString(),
    })),
  };
}
