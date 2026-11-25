import { z } from "zod";

export const PreschoolRoleModel = z.enum([
  "owner",
  "centre_head",
  "teacher",
  "parent",
]);

export const PreschoolMeResponseModel = z.object({
  role: PreschoolRoleModel,
  userName: z.string(),
  academicYearStartMonth: z.number().int().min(1).max(12),
  currentAcademicYear: z.object({
    id: z.uuid(),
    name: z.string(),
    startsOn: z.iso.date(),
    endsOn: z.iso.date(),
  }),
  hasSeveralCentres: z.boolean(),
  centres: z.array(
    z.object({
      id: z.uuid(),
      name: z.string(),
      code: z.string(),
      ownership: z.enum(["company_owned", "franchised"]),
      status: z.enum(["active", "closed"]),
    }),
  ),
  classroomIds: z.array(z.uuid()),
  children: z.array(
    z.object({
      id: z.uuid(),
      centreId: z.uuid(),
      firstName: z.string(),
      lastName: z.string().nullable(),
      photoUrl: z.string().nullable(),
    }),
  ),
});
