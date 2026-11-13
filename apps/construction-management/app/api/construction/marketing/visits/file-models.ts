import { z } from "zod";

import {
  FileDownloadQueryModel,
  presignUploadRequestModel,
  presignUploadResponseModel,
  startUploadResponseModel,
} from "@/app/api/_lib/attachments";
import type { VisitFileView } from "@/src/marketing/application/visit-files";
import { VISIT_CAPTION_MAX } from "@/src/marketing/domain/visit-files";

import { VISITS_PATH } from "./visit-models";

export function visitFilesPath(visitId: string): string {
  return `${VISITS_PATH}/${visitId}/files`;
}

export const ConstructionMarketingVisitFileParamsModel = z.object({
  id: z.uuid(),
  fileId: z.uuid(),
});

export const StartConstructionMarketingVisitFileUploadRequestModel = z.object({
  fileName: z.string().min(1).max(255),
  /** Images at most 10 MB, PDFs at most 25 MB. */
  bytes: z.number().int().min(1),
});

export const StartConstructionMarketingVisitFileUploadResponseModel =
  startUploadResponseModel();
export const PresignConstructionMarketingVisitFileUploadRequestModel =
  presignUploadRequestModel();
export const PresignConstructionMarketingVisitFileUploadResponseModel =
  presignUploadResponseModel();

export const CompleteConstructionMarketingVisitFileUploadRequestModel =
  z.object({
    /** The `key` from starting the upload. */
    key: z.string().min(1).max(500),
    fileName: z.string().min(1).max(255),
    caption: z
      .string()
      .max(VISIT_CAPTION_MAX * 2)
      .nullable()
      .optional(),
  });

export const UpdateConstructionMarketingVisitFileRequestModel = z.object({
  /** Empty or null removes it. */
  caption: z
    .string()
    .max(VISIT_CAPTION_MAX * 2)
    .nullable(),
});

export const GetConstructionMarketingVisitFileQueryModel =
  FileDownloadQueryModel;

export const ConstructionMarketingVisitFileResponseModel = z.object({
  id: z.uuid(),
  fileName: z.string(),
  contentType: z.string(),
  bytes: z.number().int(),
  viewable: z.boolean(),
  hasThumbnail: z.boolean(),
  caption: z.string().nullable(),
  createdByName: z.string(),
  createdAt: z.iso.datetime(),
  canChange: z.boolean(),
});

export const ListConstructionMarketingVisitFilesResponseModel = z.object({
  files: z.array(ConstructionMarketingVisitFileResponseModel),
});

export type ConstructionMarketingVisitFileResponse = z.infer<
  typeof ConstructionMarketingVisitFileResponseModel
>;

export function toVisitFileResponse(
  file: VisitFileView,
): ConstructionMarketingVisitFileResponse {
  return {
    id: file.id,
    fileName: file.fileName,
    contentType: file.contentType,
    bytes: file.bytes,
    viewable: file.viewable,
    hasThumbnail: file.thumbKey != null,
    caption: file.caption,
    createdByName: file.createdByName ?? "Unknown",
    createdAt: file.createdAt.toISOString(),
    canChange: file.canChange,
  };
}
