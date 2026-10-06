import { z } from "zod";

import { studentResponseFields } from "./student-response-fields";

export const ListTrainingInstituteStudentItemResponseModel = z.object(
  studentResponseFields,
);

export type ListTrainingInstituteStudentItemResponseModel = z.infer<
  typeof ListTrainingInstituteStudentItemResponseModel
>;
