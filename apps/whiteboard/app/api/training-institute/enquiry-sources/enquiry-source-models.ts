import { z } from "zod";

export const TrainingInstituteEnquirySourceParamsModel = z.object({
  id: z.uuid(),
});

export const TrainingInstituteEnquirySourceModel = z.object({
  id: z.uuid(),
  name: z.string(),
  retired: z.boolean(),
});

export const ListTrainingInstituteEnquirySourcesResponseModel = z.object({
  /** Active Sources first, then by name. Includes retired Sources. */
  items: z.array(TrainingInstituteEnquirySourceModel),
});

export const AddTrainingInstituteEnquirySourceRequestModel = z.object({
  name: z.string().trim().min(1).max(80),
});

export const RenameTrainingInstituteEnquirySourceRequestModel = z.object({
  name: z.string().trim().min(1).max(80),
});
