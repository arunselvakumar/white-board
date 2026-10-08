import { StatusCodes } from "http-status-codes";

import type {
  OpenApiComponents,
  OpenApiOperation,
} from "@/app/api/_lib/openapi";
import { IMAGE_CONTENT_TYPES } from "@/src/shared-kernel/files";
import { DOCUMENT_CONTENT_TYPES } from "@/src/shared-kernel/files/document-file";

import {
  AddConstructionLabourPartyDocumentRequestModel,
  ConstructionLabourPartyDocumentResponseModel,
  ConstructionLabourPartyPhotoResponseModel,
  ListConstructionLabourPartyDocumentsResponseModel,
  PartyDocumentParamsModel,
  PartyIdParamsModel,
} from "./party-file-models";

/** Photo and document models, shared by labourers and vendors. */
export const partyFileOpenApiComponents: OpenApiComponents = {
  ConstructionLabourPartyPhotoResponseModel,
  ConstructionLabourPartyDocumentResponseModel,
  ListConstructionLabourPartyDocumentsResponseModel,
};

const ERRORS = [
  StatusCodes.BAD_REQUEST,
  StatusCodes.UNAUTHORIZED,
  StatusCodes.FORBIDDEN,
  StatusCodes.NOT_FOUND,
] as const;

/**
 * The six photo and document routes under `basePath/{id}` for a labourer
 * or a vendor (`noun`), tagged `tags`.
 */
export function partyFileOpenApiOperations(
  basePath: string,
  noun: string,
  tags: string[],
): OpenApiOperation[] {
  const item = `${basePath}/{id}`;
  return [
    {
      method: "get",
      path: `${item}/photo`,
      summary: `The ${noun}'s photo`,
      tags,
      params: PartyIdParamsModel,
      successStatus: StatusCodes.OK,
      successDescription: "The image",
      successBinaryContentTypes: [...IMAGE_CONTENT_TYPES],
      errors: [...ERRORS],
    },
    {
      method: "post",
      path: `${item}/photo`,
      summary: `Set or replace the ${noun}'s photo (the image as the body, ≤ 10 MB)`,
      tags,
      params: PartyIdParamsModel,
      bodyBinaryContentTypes: [...IMAGE_CONTENT_TYPES],
      successStatus: StatusCodes.OK,
      successDescription: "The new photo URL",
      successSchema: ConstructionLabourPartyPhotoResponseModel,
      errors: [...ERRORS, StatusCodes.CONFLICT],
    },
    {
      method: "post",
      path: `${item}/photo/remove`,
      summary: `Remove the ${noun}'s photo`,
      tags,
      params: PartyIdParamsModel,
      successStatus: StatusCodes.OK,
      successDescription: "No photo",
      successSchema: ConstructionLabourPartyPhotoResponseModel,
      errors: [...ERRORS, StatusCodes.CONFLICT],
    },
    {
      method: "get",
      path: `${item}/documents`,
      summary: `The ${noun}'s Other Documents`,
      tags,
      params: PartyIdParamsModel,
      successStatus: StatusCodes.OK,
      successDescription: "Documents, oldest first",
      successSchema: ListConstructionLabourPartyDocumentsResponseModel,
      errors: [...ERRORS],
    },
    {
      method: "post",
      path: `${item}/documents`,
      summary: `Add a document to the ${noun} (PDF, PNG, JPEG or WebP as the body, ≤ 10 MB; ?fileName=)`,
      tags,
      params: PartyIdParamsModel,
      query: AddConstructionLabourPartyDocumentRequestModel,
      bodyBinaryContentTypes: [...DOCUMENT_CONTENT_TYPES],
      successStatus: StatusCodes.CREATED,
      successDescription: "The document",
      successSchema: ConstructionLabourPartyDocumentResponseModel,
      errors: [...ERRORS, StatusCodes.CONFLICT],
    },
    {
      method: "get",
      path: `${item}/documents/{docId}`,
      summary: `Download one of the ${noun}'s documents`,
      tags,
      params: PartyDocumentParamsModel,
      successStatus: StatusCodes.OK,
      successDescription: "The file",
      successBinaryContentTypes: [...DOCUMENT_CONTENT_TYPES],
      errors: [...ERRORS],
    },
    {
      method: "post",
      path: `${item}/documents/{docId}/delete`,
      summary: `Delete one of the ${noun}'s documents`,
      tags,
      params: PartyDocumentParamsModel,
      successStatus: StatusCodes.NO_CONTENT,
      successDescription: "Deleted",
      errors: [...ERRORS],
    },
  ];
}
