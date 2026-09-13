import type { CourseReadModel } from "@/src/training/application/course-read-model";

export function mapCourseResponse(course: CourseReadModel) {
  return {
    id: course.id,
    name: course.name,
    duration: course.duration,
    description: course.description,
    defaultFeeAmountPaise: course.defaultFeeAmountPaise,
    archivedAt: course.archivedAt?.toISOString() ?? null,
    createdAt: course.createdAt.toISOString(),
    updatedAt: course.updatedAt.toISOString(),
    createdByUserId: course.createdByUserId,
  };
}
