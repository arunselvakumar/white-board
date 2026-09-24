import type { Course } from "../domain/course";
import type { CourseDetailsValue } from "../domain/course-details";
import type { CourseDurationValue } from "../domain/course-duration";

export type CourseReadModel = CourseDetailsValue & {
  id: string;
  name: string;
  duration: CourseDurationValue;
  description: string | null;
  defaultFeeAmountPaise: number;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  createdByUserId: string;
};

export function toCourseReadModel(course: Course): CourseReadModel {
  return {
    id: course.id.value,
    name: course.name.value,
    duration: course.duration.value,
    ...course.details.value,
    description: course.description?.value ?? null,
    defaultFeeAmountPaise: course.defaultFeeAmount.value,
    archivedAt: course.archivedAt,
    createdAt: course.createdAt,
    updatedAt: course.updatedAt,
    createdByUserId: course.createdByUserId.value,
  };
}
