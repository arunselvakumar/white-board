import { z } from "zod";

import { enrollmentResponseFields } from "./enrollment-response-fields";

export const CreateTrainingInstituteEnrollmentResponseModel = z.object(
  enrollmentResponseFields,
);
export type CreateTrainingInstituteEnrollmentResponseModel = z.infer<
  typeof CreateTrainingInstituteEnrollmentResponseModel
>;
