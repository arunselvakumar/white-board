import { z } from "zod";
import {
  TeacherDetailsRequestModel,
  TeacherPhotoRequestModel,
  TeacherPrivateDetailsRequestModel,
} from "../../teacher-details-model";

export const UpdateTeacherProfileRequestModel = z.object({
  name: z.string().trim().min(1).max(200),
  kind: z.enum(["centre_teacher", "visiting_tutor"]),
  phone: z.string().max(32).nullable().optional(),
  qualificationSummary: z.string().max(1000).nullable().optional(),
  details: TeacherDetailsRequestModel.optional(),
  privateDetails: TeacherPrivateDetailsRequestModel.optional(),
  photo: TeacherPhotoRequestModel.optional(),
});
