import { z } from "zod";

import { courseResponseFields } from "./course-response-fields";

export const CreateCourseResponseModel = z.object(courseResponseFields);

export type CreateCourseResponseModel = z.infer<
  typeof CreateCourseResponseModel
>;
