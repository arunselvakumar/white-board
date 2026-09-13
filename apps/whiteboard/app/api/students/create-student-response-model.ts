import { z } from "zod";

import { studentResponseFields } from "./student-response-fields";

export const CreateStudentResponseModel = z.object(studentResponseFields);

export type CreateStudentResponseModel = z.infer<
  typeof CreateStudentResponseModel
>;
