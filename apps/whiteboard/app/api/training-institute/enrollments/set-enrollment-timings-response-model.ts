import { z } from "zod";

import { enrollmentResponseFields } from "./enrollment-response-fields";

export const SetTrainingInstituteEnrollmentTimingsResponseModel = z.object(
  enrollmentResponseFields,
);
export type SetTrainingInstituteEnrollmentTimingsResponseModel = z.infer<
  typeof SetTrainingInstituteEnrollmentTimingsResponseModel
>;
