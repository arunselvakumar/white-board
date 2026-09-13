import { z } from "zod";

import { courseResponseFields } from "./course-response-fields";

export const ListCourseItemResponseModel = z.object(courseResponseFields);

export type ListCourseItemResponseModel = z.infer<
  typeof ListCourseItemResponseModel
>;
