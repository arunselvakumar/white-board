import { z } from "zod";

import { enrollmentResponseFields } from "./enrollment-response-fields";

export const AdjustTrainingInstituteFeePlanResponseModel = z.object(
  enrollmentResponseFields,
);
export type AdjustTrainingInstituteFeePlanResponseModel = z.infer<
  typeof AdjustTrainingInstituteFeePlanResponseModel
>;
