import { z } from "zod";
import type { TeacherDocumentMetadata } from "@/src/training-institute/domain/teacher-document-repository";

export const AddTrainingInstituteTeacherDocumentRequestModel = z.object({
  kind: z.enum(["certificate", "identity", "background_check", "other"]),
  name: z.string().trim().min(1).max(200),
  mimeType: z.enum(["application/pdf", "image/jpeg", "image/png"]),
  dataBase64: z.string().min(1).max(4_200_000),
});

export const TrainingInstituteTeacherDocumentMetadataModel = z.object({
  id: z.uuid(),
  teacherId: z.uuid(),
  kind: z.enum(["certificate", "identity", "background_check", "other"]),
  name: z.string(),
  mimeType: z.string(),
  sizeBytes: z.number().int(),
  uploadedAt: z.iso.datetime(),
});

export const ListTrainingInstituteTeacherDocumentsResponseModel = z.object({
  items: z.array(TrainingInstituteTeacherDocumentMetadataModel),
});
export const TrainingInstituteTeacherDocumentParamsModel = z.object({
  id: z.uuid(),
  documentId: z.uuid(),
});
export const RemoveTrainingInstituteTeacherDocumentResponseModel = z.object({
  id: z.uuid(),
});

export function mapTeacherDocumentMetadata(
  document: TeacherDocumentMetadata,
): z.infer<typeof TrainingInstituteTeacherDocumentMetadataModel> {
  return { ...document, uploadedAt: document.uploadedAt.toISOString() };
}
