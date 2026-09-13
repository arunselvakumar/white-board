import { z } from "zod";

import { enrollmentResponseFields } from "./enrollment-response-fields";

export const OverrideEnrollmentModeResponseModel = z.object(
  enrollmentResponseFields,
);
export type OverrideEnrollmentModeResponseModel = z.infer<
  typeof OverrideEnrollmentModeResponseModel
>;
