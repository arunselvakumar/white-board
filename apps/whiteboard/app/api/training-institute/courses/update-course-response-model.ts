import { z } from "zod";

import { courseResponseFields } from "./course-response-fields";

export const UpdateTrainingInstituteCourseResponseModel =
  z.object(courseResponseFields);

export type UpdateTrainingInstituteCourseResponseModel = z.infer<
  typeof UpdateTrainingInstituteCourseResponseModel
>;
