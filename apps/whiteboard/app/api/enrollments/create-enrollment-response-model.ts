import { z } from "zod";

import { enrollmentResponseFields } from "./enrollment-response-fields";

export const CreateEnrollmentResponseModel = z.object(enrollmentResponseFields);
export type CreateEnrollmentResponseModel = z.infer<
  typeof CreateEnrollmentResponseModel
>;
