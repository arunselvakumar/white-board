import { z } from "zod";

import { courseResponseFields } from "./course-response-fields";

export const ArchiveTrainingInstituteCourseResponseModel =
  z.object(courseResponseFields);

export type ArchiveTrainingInstituteCourseResponseModel = z.infer<
  typeof ArchiveTrainingInstituteCourseResponseModel
>;
