import { z } from "zod";

export const ArchiveTrainingInstituteCourseRequestModel = z.object({
  id: z.uuid(),
});

export type ArchiveTrainingInstituteCourseRequestModel = z.infer<
  typeof ArchiveTrainingInstituteCourseRequestModel
>;
