import { z } from "zod";

import type { Teacher } from "@/src/training-institute/domain/teacher";

export const TrainingInstituteTeacherListItemResponseModel = z.object({
  id: z.uuid(),
  name: z.string(),
  preferredName: z.string().nullable(),
  email: z.string(),
  kind: z.enum(["centre_teacher", "visiting_tutor"]),
  photoUrl: z.string().nullable(),
  invitationStatus: z.enum(["not_sent", "sent", "failed", "accepted"]),
  deactivatedAt: z.iso.datetime().nullable(),
});

export function mapTeacherListItem(
  teacher: Teacher,
): z.infer<typeof TrainingInstituteTeacherListItemResponseModel> {
  return {
    id: teacher.id,
    name: teacher.name,
    preferredName: teacher.details.preferredName,
    email: teacher.email,
    kind: teacher.kind,
    photoUrl:
      teacher.photoUpdatedAt == null
        ? null
        : `/api/training-institute/teachers/${teacher.id}/photo?v=${teacher.photoUpdatedAt.getTime()}`,
    invitationStatus: teacher.invitationStatus,
    deactivatedAt: teacher.deactivatedAt?.toISOString() ?? null,
  };
}

export const ListTrainingInstituteTeachersResponseModel = z.object({
  items: z.array(TrainingInstituteTeacherListItemResponseModel),
  nextCursor: z.string().nullable(),
  prevCursor: z.string().nullable(),
  total: z.number().int(),
});
