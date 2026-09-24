import type { CourseReadModel } from "@/src/training/application/course-read-model";

export function mapCourseResponse(course: CourseReadModel) {
  return {
    id: course.id,
    name: course.name,
    duration: course.duration,
    code: course.code,
    category: course.category,
    totalLearningHours: course.totalLearningHours,
    eligibility: course.eligibility,
    learningOutcomes: course.learningOutcomes,
    syllabusOutline: course.syllabusOutline,
    description: course.description,
    defaultFeeAmountPaise: course.defaultFeeAmountPaise,
    archivedAt: course.archivedAt?.toISOString() ?? null,
    createdAt: course.createdAt.toISOString(),
    updatedAt: course.updatedAt.toISOString(),
    createdByUserId: course.createdByUserId,
  };
}
