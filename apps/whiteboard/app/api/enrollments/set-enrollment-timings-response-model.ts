import { z } from "zod";

import { enrollmentResponseFields } from "./enrollment-response-fields";

export const SetEnrollmentTimingsResponseModel = z.object(
  enrollmentResponseFields,
);
export type SetEnrollmentTimingsResponseModel = z.infer<
  typeof SetEnrollmentTimingsResponseModel
>;
