import { z } from "zod";

import { studentResponseFields } from "./student-response-fields";

export const UpdateTrainingInstituteStudentProfileResponseModel = z.object(
  studentResponseFields,
);

export type UpdateTrainingInstituteStudentProfileResponseModel = z.infer<
  typeof UpdateTrainingInstituteStudentProfileResponseModel
>;
