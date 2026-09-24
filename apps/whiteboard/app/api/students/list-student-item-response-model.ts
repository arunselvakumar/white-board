import { z } from "zod";

import { studentResponseFields } from "./student-response-fields";

export const ListStudentItemResponseModel = z.object(studentResponseFields);

export type ListStudentItemResponseModel = z.infer<
  typeof ListStudentItemResponseModel
>;
