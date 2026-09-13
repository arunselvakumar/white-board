import type { CourseRecord } from "@repo/db";

import { Course } from "../domain/course";
import { CourseDescription } from "../domain/course-description";
import { CourseDuration } from "../domain/course-duration";
import { CourseId } from "../domain/course-id";
import { CourseName } from "../domain/course-name";
import { Paise } from "../domain/paise";
import { UserId } from "../domain/user-id";
import { WorkspaceId } from "../domain/workspace-id";

export function toDomainCourse(row: CourseRecord): Course {
  return Course.reconstitute({
    id: CourseId.create(row.id),
    workspaceId: WorkspaceId.create(row.workspaceId),
    createdByUserId: UserId.create(row.createdByUserId),
    name: CourseName.create(row.name),
    duration: CourseDuration.create(row.duration),
    description: CourseDescription.create(row.description),
    defaultFeeAmount: Paise.create(row.defaultFeeAmountPaise),
    archivedAt: row.archivedAt,
    archivedByUserId:
      row.archivedByUserId == null
        ? null
        : UserId.create(row.archivedByUserId),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    deletedAt: row.deletedAt,
    deletedByUserId:
      row.deletedByUserId == null ? null : UserId.create(row.deletedByUserId),
  });
}
