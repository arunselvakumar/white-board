import { z } from "zod";

export const GetTrainingInstituteReceiptRequestModel = z.object({
  id: z.uuid(),
});
export type GetTrainingInstituteReceiptRequestModel = z.infer<
  typeof GetTrainingInstituteReceiptRequestModel
>;
