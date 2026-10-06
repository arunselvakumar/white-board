import { z } from "zod";

import { courseResponseFields } from "./course-response-fields";

export const ListTrainingInstituteCourseItemResponseModel =
  z.object(courseResponseFields);

export type ListTrainingInstituteCourseItemResponseModel = z.infer<
  typeof ListTrainingInstituteCourseItemResponseModel
>;
