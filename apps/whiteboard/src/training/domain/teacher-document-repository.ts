export type TeacherDocumentKind = "certificate" | "identity" | "background_check" | "other";

export type TeacherDocumentMetadata = {
  id: string;
  teacherId: string;
  kind: TeacherDocumentKind;
  name: string;
  mimeType: string;
  sizeBytes: number;
  uploadedAt: Date;
};

export type TeacherDocumentContent = TeacherDocumentMetadata & { bytes: Uint8Array };

export type TeacherDocumentRepository = {
  create(input: TeacherDocumentMetadata & { workspaceId: string; uploadedByUserId: string; bytes: Uint8Array }): Promise<void>;
  list(teacherId: string, workspaceId: string): Promise<TeacherDocumentMetadata[]>;
  find(id: string, teacherId: string, workspaceId: string): Promise<TeacherDocumentContent | null>;
  remove(id: string, teacherId: string, workspaceId: string, userId: string, now: Date): Promise<boolean>;
};
