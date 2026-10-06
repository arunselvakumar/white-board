import { z } from "zod";

import { ListTrainingInstituteStudentItemResponseModel } from "./list-student-item-response-model";

export const ListTrainingInstituteStudentsResponseModel = z.object({
  items: z.array(ListTrainingInstituteStudentItemResponseModel),
  nextCursor: z.string().nullable(),
  prevCursor: z.string().nullable(),
  total: z.number().int(),
});

export type ListTrainingInstituteStudentsResponseModel = z.infer<
  typeof ListTrainingInstituteStudentsResponseModel
>;
