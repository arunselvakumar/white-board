import { z } from "zod";

import { enrollmentResponseFields } from "./enrollment-response-fields";

export const AdjustFeePlanResponseModel = z.object(enrollmentResponseFields);
export type AdjustFeePlanResponseModel = z.infer<
  typeof AdjustFeePlanResponseModel
>;
