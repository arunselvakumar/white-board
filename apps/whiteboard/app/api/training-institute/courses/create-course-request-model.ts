import { z } from "zod";
import { courseWriteFields } from "./course-write-fields";

export const CreateTrainingInstituteCourseRequestModel =
  z.object(courseWriteFields);

export type CreateTrainingInstituteCourseRequestModel = z.infer<
  typeof CreateTrainingInstituteCourseRequestModel
>;
