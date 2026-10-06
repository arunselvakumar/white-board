import { z } from "zod";
import { courseWriteFields } from "./course-write-fields";

export const UpdateTrainingInstituteCourseRequestModel =
  z.object(courseWriteFields);

export type UpdateTrainingInstituteCourseRequestModel = z.infer<
  typeof UpdateTrainingInstituteCourseRequestModel
>;
