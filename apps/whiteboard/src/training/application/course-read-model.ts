import type { Course } from "../domain/course";

export type CourseReadModel = {
  id: string;
  name: string;
  duration: string;
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
    description: course.description?.value ?? null,
    defaultFeeAmountPaise: course.defaultFeeAmount.value,
    archivedAt: course.archivedAt,
    createdAt: course.createdAt,
    updatedAt: course.updatedAt,
    createdByUserId: course.createdByUserId.value,
  };
}
