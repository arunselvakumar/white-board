import { z } from "zod";

import { enrollmentResponseFields } from "./enrollment-response-fields";

export const GetEnrollmentResponseModel = z.object(enrollmentResponseFields);
export type GetEnrollmentResponseModel = z.infer<
  typeof GetEnrollmentResponseModel
>;
