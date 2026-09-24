import type { CourseDetailsValue } from "../domain/course-details";
import type { CourseDurationValue } from "../domain/course-duration";

export type CreateCourseCommand = CourseDetailsValue & {
  name: string;
  duration: CourseDurationValue;
  description?: string | null;
  defaultFeeAmountPaise: number;
  workspaceId: string;
  createdByUserId: string;
};
