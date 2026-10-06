import { z } from "zod";

import { ListTrainingInstituteCourseItemResponseModel } from "./list-course-item-response-model";

export const ListTrainingInstituteCoursesResponseModel = z.object({
  items: z.array(ListTrainingInstituteCourseItemResponseModel),
  nextCursor: z.string().nullable(),
  prevCursor: z.string().nullable(),
  total: z.number().int(),
});

export type ListTrainingInstituteCoursesResponseModel = z.infer<
  typeof ListTrainingInstituteCoursesResponseModel
>;
