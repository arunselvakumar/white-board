import type { BatchReadModel } from "@/src/training/application/batch-read-model";

export function mapBatchResponse(batch: BatchReadModel) {
  return {
    id: batch.id,
    courseId: batch.courseId,
    name: batch.name,
    classMode: batch.classMode,
    capacity: batch.capacity,
    room: batch.room,
    joinUrl: batch.joinUrl,
    meetingOption: batch.meetingOption,
    timings: batch.timings,
    timezone: batch.timezone,
    closedAt: batch.closedAt?.toISOString() ?? null,
    enrolledCount: batch.enrolledCount,
    createdAt: batch.createdAt.toISOString(),
    updatedAt: batch.updatedAt.toISOString(),
    createdByUserId: batch.createdByUserId,
  };
}
