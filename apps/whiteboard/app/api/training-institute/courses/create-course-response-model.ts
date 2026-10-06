import { z } from "zod";

import { courseResponseFields } from "./course-response-fields";

export const CreateTrainingInstituteCourseResponseModel =
  z.object(courseResponseFields);

export type CreateTrainingInstituteCourseResponseModel = z.infer<
  typeof CreateTrainingInstituteCourseResponseModel
>;
