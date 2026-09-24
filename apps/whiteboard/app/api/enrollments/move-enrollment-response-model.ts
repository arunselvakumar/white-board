import { z } from "zod";

import { enrollmentResponseFields } from "./enrollment-response-fields";

export const MoveEnrollmentResponseModel = z.object(enrollmentResponseFields);
export type MoveEnrollmentResponseModel = z.infer<
  typeof MoveEnrollmentResponseModel
>;
