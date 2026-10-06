import { z } from "zod";

import { enrollmentResponseFields } from "./enrollment-response-fields";

export const GetTrainingInstituteEnrollmentResponseModel = z.object(
  enrollmentResponseFields,
);
export type GetTrainingInstituteEnrollmentResponseModel = z.infer<
  typeof GetTrainingInstituteEnrollmentResponseModel
>;
