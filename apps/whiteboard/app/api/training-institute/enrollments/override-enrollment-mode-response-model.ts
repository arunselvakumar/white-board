import { z } from "zod";

import { enrollmentResponseFields } from "./enrollment-response-fields";

export const OverrideTrainingInstituteEnrollmentModeResponseModel = z.object(
  enrollmentResponseFields,
);
export type OverrideTrainingInstituteEnrollmentModeResponseModel = z.infer<
  typeof OverrideTrainingInstituteEnrollmentModeResponseModel
>;
