import { z } from "zod";
import { withAppBasePath } from "@/lib/app-base-path";

import type { Teacher } from "@/src/training/domain/teacher";
import { TeacherDetailsResponseModel } from "./teacher-details-model";

export const TeacherResponseModel = z.object({
  id: z.uuid(),
  name: z.string(),
  email: z.string(),
  kind: z.enum(["centre_teacher", "visiting_tutor"]),
  phone: z.string().nullable(),
  qualificationSummary: z.string().nullable(),
  details: TeacherDetailsResponseModel,
  photoUrl: z.string().nullable(),
  privateDetails: z.object({
    idNumberLast4: z.string().nullable(),
    bankAccountLast4: z.string().nullable(),
  }),
  invitationStatus: z.enum(["not_sent", "sent", "failed", "accepted"]),
  clerkUserId: z.string().nullable(),
  deactivatedAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export function mapTeacherResponse(
  teacher: Teacher,
): z.infer<typeof TeacherResponseModel> {
  return {
    id: teacher.id,
    name: teacher.name,
    email: teacher.email,
    kind: teacher.kind,
    phone: teacher.phone,
    qualificationSummary: teacher.qualificationSummary,
    details: {
      ...teacher.details,
      availability: teacher.details.availability.map((slot) => ({
        daysOfWeek: [...slot.daysOfWeek],
        startTime: slot.startTime,
        endTime: slot.endTime,
      })),
    },
    photoUrl:
      teacher.photoUpdatedAt == null
        ? null
        : withAppBasePath(
            `/api/teachers/${teacher.id}/photo?v=${teacher.photoUpdatedAt.getTime()}`,
          ),
    privateDetails: {
      idNumberLast4: teacher.idNumberLast4,
      bankAccountLast4: teacher.bankAccountLast4,
    },
    invitationStatus: teacher.invitationStatus,
    clerkUserId: teacher.clerkUserId,
    deactivatedAt: teacher.deactivatedAt?.toISOString() ?? null,
    createdAt: teacher.createdAt.toISOString(),
    updatedAt: teacher.updatedAt.toISOString(),
  };
}
