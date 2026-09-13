import type { Batch } from "../domain/batch";
import type { WeeklySlot } from "../domain/weekly-timings";

export type BatchReadModel = {
  id: string;
  courseId: string;
  name: string;
  classMode: string;
  capacity: number;
  room: string | null;
  joinUrl: string | null;
  timings: WeeklySlot[];
  timezone: string;
  closedAt: Date | null;
  enrolledCount: number;
  createdAt: Date;
  updatedAt: Date;
  createdByUserId: string;
};

export function toBatchReadModel(
  batch: Batch,
  enrolledCount = 0,
): BatchReadModel {
  return {
    id: batch.id.value,
    courseId: batch.courseId.value,
    name: batch.name.value,
    classMode: batch.classMode.value,
    capacity: batch.capacity.value,
    room: batch.room?.value ?? null,
    joinUrl: batch.joinUrl?.value ?? null,
    timings: batch.timings.toJson(),
    timezone: batch.timezone,
    closedAt: batch.closedAt,
    enrolledCount,
    createdAt: batch.createdAt,
    updatedAt: batch.updatedAt,
    createdByUserId: batch.createdByUserId.value,
  };
}
