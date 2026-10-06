import { z } from "zod";

import { enrollmentResponseFields } from "./enrollment-response-fields";

export const MoveTrainingInstituteEnrollmentResponseModel = z.object(
  enrollmentResponseFields,
);
export type MoveTrainingInstituteEnrollmentResponseModel = z.infer<
  typeof MoveTrainingInstituteEnrollmentResponseModel
>;
