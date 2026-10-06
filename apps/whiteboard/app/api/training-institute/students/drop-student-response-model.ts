import { z } from "zod";

import { studentResponseFields } from "./student-response-fields";

export const DropTrainingInstituteStudentResponseModel = z.object(
  studentResponseFields,
);

export type DropTrainingInstituteStudentResponseModel = z.infer<
  typeof DropTrainingInstituteStudentResponseModel
>;
