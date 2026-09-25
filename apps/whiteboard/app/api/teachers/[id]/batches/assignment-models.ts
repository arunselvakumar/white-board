import { z } from "zod";

export const AssignTeacherBatchRequestModel = z.object({ batchId: z.uuid() });
export const AssignedBatchResponseModel = z.object({
  id: z.uuid(), name: z.string(), courseId: z.uuid(), classMode: z.string(),
  timings: z.unknown(), timezone: z.string(), room: z.string().nullable(), assignedAt: z.iso.datetime(),
});
export const TeacherBatchesResponseModel = z.object({ items: z.array(AssignedBatchResponseModel) });

export function mapAssignedBatches(items: {
  id: string; name: string; courseId: string; classMode: string; timings: unknown;
  timezone: string; room: string | null; assignedAt: Date;
}[]) {
  return { items: items.map((item) => ({ ...item, assignedAt: item.assignedAt.toISOString() })) };
}
