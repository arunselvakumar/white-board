import { z } from "zod";

import { enrollmentResponseFields } from "./enrollment-response-fields";

export const EndTrainingInstituteEnrollmentResponseModel = z.object(
  enrollmentResponseFields,
);
export type EndTrainingInstituteEnrollmentResponseModel = z.infer<
  typeof EndTrainingInstituteEnrollmentResponseModel
>;
