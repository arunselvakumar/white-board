import { z } from "zod";

import { courseResponseFields } from "./course-response-fields";

export const GetTrainingInstituteCourseResponseModel =
  z.object(courseResponseFields);

export type GetTrainingInstituteCourseResponseModel = z.infer<
  typeof GetTrainingInstituteCourseResponseModel
>;
