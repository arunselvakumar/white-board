import { z } from "zod";

import { courseResponseFields } from "./course-response-fields";

export const GetCourseResponseModel = z.object(courseResponseFields);

export type GetCourseResponseModel = z.infer<typeof GetCourseResponseModel>;
