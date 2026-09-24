import { z } from "zod";

import { ListStudentItemResponseModel } from "./list-student-item-response-model";

export const ListStudentsResponseModel = z.object({
  items: z.array(ListStudentItemResponseModel),
  nextCursor: z.string().nullable(),
  prevCursor: z.string().nullable(),
  total: z.number().int(),
});

export type ListStudentsResponseModel = z.infer<
  typeof ListStudentsResponseModel
>;
