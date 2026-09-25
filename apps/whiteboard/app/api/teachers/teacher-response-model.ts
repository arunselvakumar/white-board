import { z } from "zod";

import type { Teacher } from "@/src/training/domain/teacher";

export const TeacherResponseModel = z.object({
  id: z.uuid(),
  name: z.string(),
  email: z.string(),
  kind: z.enum(["centre_teacher", "visiting_tutor"]),
  phone: z.string().nullable(),
  qualificationSummary: z.string().nullable(),
  invitationStatus: z.enum(["not_sent", "sent", "failed", "accepted"]),
  clerkUserId: z.string().nullable(),
  deactivatedAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export function mapTeacherResponse(teacher: Teacher): z.infer<typeof TeacherResponseModel> {
  return {
    id: teacher.id,
    name: teacher.name,
    email: teacher.email,
    kind: teacher.kind,
    phone: teacher.phone,
    qualificationSummary: teacher.qualificationSummary,
    invitationStatus: teacher.invitationStatus,
    clerkUserId: teacher.clerkUserId,
    deactivatedAt: teacher.deactivatedAt?.toISOString() ?? null,
    createdAt: teacher.createdAt.toISOString(),
    updatedAt: teacher.updatedAt.toISOString(),
  };
}
