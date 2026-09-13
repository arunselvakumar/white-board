import { z } from "zod";

export const GetEnrollmentRequestModel = z.object({ id: z.uuid() });
export type GetEnrollmentRequestModel = z.infer<
  typeof GetEnrollmentRequestModel
>;
