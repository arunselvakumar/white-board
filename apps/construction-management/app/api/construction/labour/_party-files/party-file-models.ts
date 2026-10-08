import { z } from "zod";

import type { PartyDocument } from "@/src/labour/application/party-files";
import { fileVersion } from "@/src/shared-kernel/files";

export const PartyIdParamsModel = z.object({ id: z.uuid() });

export const PartyDocumentParamsModel = z.object({
  id: z.uuid(),
  docId: z.uuid(),
});

export const AddConstructionLabourPartyDocumentRequestModel = z.object({
  /** The file's name as the user chose it; shown in the list. */
  fileName: z.string().max(255).optional(),
});

export const ConstructionLabourPartyPhotoResponseModel = z.object({
  /** Same-origin URL of the photo (versioned), or null after removal. */
  photoUrl: z.string().nullable(),
});

export const ConstructionLabourPartyDocumentResponseModel = z.object({
  id: z.uuid(),
  fileName: z.string(),
  contentType: z.string(),
  bytes: z.int(),
  createdAt: z.iso.datetime(),
  /** Same-origin URL that streams the file. */
  url: z.string(),
});

export const ListConstructionLabourPartyDocumentsResponseModel = z.object({
  items: z.array(ConstructionLabourPartyDocumentResponseModel),
});

export type ConstructionLabourPartyDocumentResponseModel = z.infer<
  typeof ConstructionLabourPartyDocumentResponseModel
>;

export function photoUrl(basePath: string, id: string, key: string | null) {
  return key == null ? null : `${basePath}/${id}/photo?v=${fileVersion(key)}`;
}

export function toPartyDocumentResponse(
  basePath: string,
  ownerId: string,
  document: PartyDocument,
): ConstructionLabourPartyDocumentResponseModel {
  return {
    id: document.id,
    fileName: document.fileName,
    contentType: document.contentType,
    bytes: document.bytes,
    createdAt: document.createdAt.toISOString(),
    url: `${basePath}/${ownerId}/documents/${document.id}`,
  };
}
