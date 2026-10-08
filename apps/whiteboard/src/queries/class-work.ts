import { queryOptions } from "@tanstack/react-query";

import type {
  AttachmentView,
  BatchClassWorkView,
  FamilyClassWorkView,
  FamilyHomeworkView,
  HomeworkSubmissionsView,
  HomeworkView,
  StudyMaterialView,
  SubmissionView,
} from "@/src/training-institute/application/class-work-views";

import { apiJson } from "./http";

export type {
  AttachmentView,
  BatchClassWorkView,
  ClassDateView,
  FamilyBatchView,
  FamilyClassWorkStudentView,
  FamilyClassWorkView,
  FamilyHomeworkStatus,
  FamilyHomeworkView,
  FamilyStudyMaterialView,
  HomeworkCountsView,
  HomeworkRosterRowView,
  HomeworkRosterStatus,
  HomeworkSubmissionsView,
  HomeworkView,
  PostedByView,
  StaffHomeworkView,
  StudyMaterialView,
  SubmissionView,
} from "@/src/training-institute/application/class-work-views";

const BASE = "/api/training-institute";

/** PDF, JPEG, or PNG; at most 4 MB each and 5 per item (ADR-0033). */
export const ATTACHMENT_MAX_BYTES = 4 * 1024 * 1024;
export const ATTACHMENT_MAX_COUNT = 5;
export const ATTACHMENT_ACCEPT = "application/pdf,image/jpeg,image/png";
/** Photos are shrunk to this long edge before upload. */
const PHOTO_MAX_SIDE = 2000;

export type StudyMaterialInput = {
  title: string;
  note: string | null;
  linkUrl: string | null;
  classDate: string | null;
  /** Every attachment the item should have: kept ones and new uploads. */
  attachmentIds: string[];
};

export type HomeworkInput = {
  title: string;
  instructions: string;
  classDate: string;
  dueOn: string;
  attachmentIds: string[];
};

export type SubmitHomeworkInput = {
  studentId: string;
  note: string | null;
  attachmentIds: string[];
};

function post<T>(path: string, body?: unknown): Promise<T> {
  return apiJson<T>(`${BASE}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
}

export const classWorkQueries = {
  key: {
    all: ["class-work"] as const,
    batch: (batchId: string) => ["class-work", "batch", batchId] as const,
    submissions: (homeworkId: string) =>
      ["class-work", "submissions", homeworkId] as const,
    family: ["class-work", "family"] as const,
  },
  batch: (batchId: string) =>
    queryOptions({
      queryKey: classWorkQueries.key.batch(batchId),
      queryFn: () =>
        apiJson<BatchClassWorkView>(`${BASE}/batches/${batchId}/class-work`),
    }),
  submissions: (homeworkId: string) =>
    queryOptions({
      queryKey: classWorkQueries.key.submissions(homeworkId),
      queryFn: () =>
        apiJson<HomeworkSubmissionsView>(
          `${BASE}/homework/${homeworkId}/submissions`,
        ),
    }),
  /** `sessionScope` keeps one User's cache from showing for another. */
  family: (sessionScope: string) =>
    queryOptions({
      queryKey: [...classWorkQueries.key.family, sessionScope] as const,
      queryFn: () => apiJson<FamilyClassWorkView>(`${BASE}/home/homework`),
    }),
};

export function postStudyMaterial(
  batchId: string,
  input: StudyMaterialInput,
): Promise<StudyMaterialView> {
  return post(`/batches/${batchId}/study-materials`, input);
}

export function updateStudyMaterial(
  id: string,
  input: StudyMaterialInput,
): Promise<StudyMaterialView> {
  return post(`/study-materials/${id}/update`, input);
}

export function removeStudyMaterial(id: string): Promise<StudyMaterialView> {
  return post(`/study-materials/${id}/remove`);
}

export function setHomework(
  batchId: string,
  input: HomeworkInput,
): Promise<HomeworkView> {
  return post(`/batches/${batchId}/homework`, input);
}

export function updateHomework(
  id: string,
  input: HomeworkInput,
): Promise<HomeworkView> {
  return post(`/homework/${id}/update`, input);
}

export function removeHomework(id: string): Promise<HomeworkView> {
  return post(`/homework/${id}/remove`);
}

export function checkSubmission(
  homeworkId: string,
  submissionId: string,
  remark: string | null,
): Promise<SubmissionView> {
  return post(`/homework/${homeworkId}/submissions/${submissionId}/check`, {
    remark,
  });
}

export function submitHomework(
  homeworkId: string,
  input: SubmitHomeworkInput,
): Promise<FamilyHomeworkView> {
  return post(`/homework/${homeworkId}/submit`, input);
}

export function undoHomeworkSubmission(
  homeworkId: string,
  studentId: string,
): Promise<FamilyHomeworkView> {
  return post(`/homework/${homeworkId}/undo-submission`, { studentId });
}

/** Download link for an attachment the signed-in User can see. */
export function attachmentHref(attachmentId: string): string {
  return `${BASE}/attachments/${attachmentId}`;
}

function shrinkPhoto(file: File): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const url = URL.createObjectURL(file);
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not read this photo. Choose a JPEG or PNG."));
    };
    image.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(
        1,
        PHOTO_MAX_SIDE / Math.max(image.width, image.height),
      );
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(image.width * scale));
      canvas.height = Math.max(1, Math.round(image.height * scale));
      const context = canvas.getContext("2d");
      if (context == null) {
        reject(new Error("Could not prepare this photo."));
        return;
      }
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(
        (blob) => {
          if (blob == null) reject(new Error("Could not prepare this photo."));
          else resolve(blob);
        },
        "image/jpeg",
        0.85,
      );
    };
    image.src = url;
  });
}

/**
 * Uploads one file so it can be attached when the item is saved. Photos are
 * shrunk to JPEG first; a PDF must already be 4 MB or smaller.
 */
export async function uploadAttachment(file: File): Promise<AttachmentView> {
  if (
    !["application/pdf", "image/jpeg", "image/png"].includes(file.type) ||
    file.size === 0
  )
    throw new Error("Choose a PDF, JPEG, or PNG file.");
  let body: Blob = file;
  let mimeType = file.type;
  let name = file.name;
  if (file.type !== "application/pdf" && file.size > 1024 * 1024) {
    body = await shrinkPhoto(file);
    mimeType = "image/jpeg";
    name = name.replace(/\.(png|jpe?g)$/i, "") + ".jpg";
  }
  if (body.size > ATTACHMENT_MAX_BYTES)
    throw new Error(
      file.type === "application/pdf"
        ? "This PDF is larger than 4 MB. Choose a smaller file."
        : "This photo is still larger than 4 MB. Choose a smaller one.",
    );
  return apiJson<AttachmentView>(
    `${BASE}/attachments?name=${encodeURIComponent(name.slice(0, 200))}`,
    { method: "POST", headers: { "content-type": mimeType }, body },
  );
}
