import { z } from "zod";

import { enrollmentResponseFields } from "./enrollment-response-fields";

export const EndEnrollmentResponseModel = z.object(enrollmentResponseFields);
export type EndEnrollmentResponseModel = z.infer<
  typeof EndEnrollmentResponseModel
>;
