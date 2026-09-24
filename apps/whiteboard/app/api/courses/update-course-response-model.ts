import { z } from "zod";

import { courseResponseFields } from "./course-response-fields";

export const UpdateCourseResponseModel = z.object(courseResponseFields);

export type UpdateCourseResponseModel = z.infer<
  typeof UpdateCourseResponseModel
>;
