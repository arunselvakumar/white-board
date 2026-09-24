import type { BatchRecord } from "@repo/db";

import { Batch, batchJoinUrl, batchRoom } from "../domain/batch";
import { BatchId } from "../domain/batch-id";
import { BatchName } from "../domain/batch-name";
import { Capacity } from "../domain/capacity";
import { ClassMode } from "../domain/class-mode";
import { CourseId } from "../domain/course-id";
import { UserId } from "../domain/user-id";
import { WeeklyTimings } from "../domain/weekly-timings";
import { WorkspaceId } from "../domain/workspace-id";

export function toDomainBatch(row: BatchRecord): Batch {
  return Batch.reconstitute({
    id: BatchId.create(row.id),
    workspaceId: WorkspaceId.create(row.workspaceId),
    courseId: CourseId.create(row.courseId),
    createdByUserId: UserId.create(row.createdByUserId),
    name: BatchName.create(row.name),
    classMode: ClassMode.create(row.classMode),
    capacity: Capacity.create(row.capacity),
    room: batchRoom(row.room),
    joinUrl: batchJoinUrl(row.joinUrl),
    timings: WeeklyTimings.create(row.timings),
    timezone: row.timezone,
    closedAt: row.closedAt,
    closedByUserId:
      row.closedByUserId == null ? null : UserId.create(row.closedByUserId),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    deletedAt: row.deletedAt,
    deletedByUserId:
      row.deletedByUserId == null ? null : UserId.create(row.deletedByUserId),
  });
}
