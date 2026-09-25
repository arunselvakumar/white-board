import { z } from "zod";

import { TeacherResponseModel } from "./teacher-response-model";

export const ListTeachersResponseModel = z.object({
  items: z.array(TeacherResponseModel),
  nextCursor: z.string().nullable(),
  prevCursor: z.string().nullable(),
  total: z.number().int(),
});
