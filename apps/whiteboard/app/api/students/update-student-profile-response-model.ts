import { z } from "zod";

import { studentResponseFields } from "./student-response-fields";

export const UpdateStudentProfileResponseModel = z.object(
  studentResponseFields,
);

export type UpdateStudentProfileResponseModel = z.infer<
  typeof UpdateStudentProfileResponseModel
>;
