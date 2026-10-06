import type { CourseDetailsValue } from "../domain/course-details";
import type { CourseDurationValue } from "../domain/course-duration";

export type UpdateCourseCommand = CourseDetailsValue & {
  id: string;
  name: string;
  duration: CourseDurationValue;
  description?: string | null;
  defaultFeeAmountPaise: number;
  workspaceId: string;
};
