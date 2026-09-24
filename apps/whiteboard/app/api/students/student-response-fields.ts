import { z } from "zod";
import { StudentDetailsResponseModel } from "./student-details-model";

export const studentResponseFields = {
  id: z.uuid(),
  name: z.string(),
  phone: z.string(),
  email: z.string().nullable(),
  photoUrl: z.string().nullable(),
  address: z.string().nullable(),
  idProofNote: z.string().nullable(),
  guardianName: z.string().nullable(),
  guardianPhone: z.string().nullable(),
  details: StudentDetailsResponseModel,
  droppedAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  createdByUserId: z.string(),
};
