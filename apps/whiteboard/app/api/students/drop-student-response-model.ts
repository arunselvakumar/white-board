import { z } from "zod";

import { studentResponseFields } from "./student-response-fields";

export const DropStudentResponseModel = z.object(studentResponseFields);

export type DropStudentResponseModel = z.infer<typeof DropStudentResponseModel>;
