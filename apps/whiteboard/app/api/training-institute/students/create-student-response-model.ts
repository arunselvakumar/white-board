import { z } from "zod";

import { studentResponseFields } from "./student-response-fields";

export const CreateTrainingInstituteStudentResponseModel = z.object(
  studentResponseFields,
);

export type CreateTrainingInstituteStudentResponseModel = z.infer<
  typeof CreateTrainingInstituteStudentResponseModel
>;
