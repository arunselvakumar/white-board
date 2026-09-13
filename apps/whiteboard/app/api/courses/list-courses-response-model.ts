import { z } from "zod";

import { ListCourseItemResponseModel } from "./list-course-item-response-model";

export const ListCoursesResponseModel = z.object({
  items: z.array(ListCourseItemResponseModel),
  nextCursor: z.string().nullable(),
  prevCursor: z.string().nullable(),
  total: z.number().int(),
});

export type ListCoursesResponseModel = z.infer<typeof ListCoursesResponseModel>;
