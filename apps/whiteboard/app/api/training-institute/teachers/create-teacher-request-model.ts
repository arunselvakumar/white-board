import { z } from "zod";
import {
  TrainingInstituteTeacherDetailsRequestModel,
  TrainingInstituteTeacherPhotoRequestModel,
  TrainingInstituteTeacherPrivateDetailsRequestModel,
} from "./teacher-details-model";

export const CreateTrainingInstituteTeacherRequestModel = z.object({
  name: z.string().trim().min(1).max(200),
  email: z.string().trim().max(320).pipe(z.email()),
  kind: z.enum(["centre_teacher", "visiting_tutor"]),
  phone: z.string().max(32).nullable().optional(),
  qualificationSummary: z.string().max(1000).nullable().optional(),
  details: TrainingInstituteTeacherDetailsRequestModel.optional(),
  privateDetails: TrainingInstituteTeacherPrivateDetailsRequestModel.optional(),
  photo: TrainingInstituteTeacherPhotoRequestModel.optional(),
});
