import { StatusCodes } from "http-status-codes";

import {
  FILE_CONTENT_TYPES,
  FileDownloadQueryModel,
  UploadKeyQueryModel,
  presignUploadRequestModel,
  presignUploadResponseModel,
} from "@/app/api/_lib/attachments";
import type {
  OpenApiComponents,
  OpenApiOperation,
} from "@/app/api/_lib/openapi";

import { ConstructionProjectsProjectParamsModel } from "../../project-models";
import {
  AddConstructionProjectsDrawingRequestModel,
  AddConstructionProjectsDrawingRevisionRequestModel,
  ConstructionProjectsDrawingAlbumParamsModel,
  ConstructionProjectsDrawingAlbumResponseModel,
  ConstructionProjectsDrawingParamsModel,
  ConstructionProjectsDrawingResponseModel,
  ConstructionProjectsDrawingRevisionParamsModel,
  ConstructionProjectsDrawingRevisionResponseModel,
  CreateConstructionProjectsDrawingAlbumRequestModel,
  GetConstructionProjectsDrawingAlbumResponseModel,
  GetConstructionProjectsDrawingResponseModel,
  ListConstructionProjectsDrawingAlbumsResponseModel,
  MoveConstructionProjectsDrawingRequestModel,
  StartConstructionProjectsDrawingUploadRequestModel,
  StartConstructionProjectsDrawingUploadResponseModel,
  UpdateConstructionProjectsDrawingAlbumRequestModel,
  UpdateConstructionProjectsDrawingRequestModel,
} from "./drawing-models";

const DRAWINGS = ["Construction · Projects"];

const BASE = "/api/construction/projects/projects/{id}/drawings";

const ERRORS = [
  StatusCodes.BAD_REQUEST,
  StatusCodes.UNAUTHORIZED,
  StatusCodes.FORBIDDEN,
  StatusCodes.NOT_FOUND,
] as const;

const PresignConstructionProjectsDrawingUploadRequestModel =
  presignUploadRequestModel();
const PresignConstructionProjectsDrawingUploadResponseModel =
  presignUploadResponseModel();

/** Project Drawings' models (CM-408). */
export const drawingOpenApiComponents: OpenApiComponents = {
  ConstructionProjectsDrawingAlbumResponseModel,
  ListConstructionProjectsDrawingAlbumsResponseModel,
  CreateConstructionProjectsDrawingAlbumRequestModel,
  UpdateConstructionProjectsDrawingAlbumRequestModel,
  GetConstructionProjectsDrawingAlbumResponseModel,
  ConstructionProjectsDrawingRevisionResponseModel,
  ConstructionProjectsDrawingResponseModel,
  GetConstructionProjectsDrawingResponseModel,
  StartConstructionProjectsDrawingUploadRequestModel,
  StartConstructionProjectsDrawingUploadResponseModel,
  PresignConstructionProjectsDrawingUploadRequestModel,
  PresignConstructionProjectsDrawingUploadResponseModel,
  AddConstructionProjectsDrawingRequestModel,
  AddConstructionProjectsDrawingRevisionRequestModel,
  UpdateConstructionProjectsDrawingRequestModel,
  MoveConstructionProjectsDrawingRequestModel,
};

/** Project Drawings' routes (CM-408), under `projects.drawings`. */
export const drawingOpenApiOperations: OpenApiOperation[] = [
  {
    method: "get",
    path: `${BASE}/albums`,
    summary: "The Project's drawing albums by name, with drawing counts (read)",
    tags: DRAWINGS,
    params: ConstructionProjectsProjectParamsModel,
    successStatus: StatusCodes.OK,
    successDescription: "Albums",
    successSchema: ListConstructionProjectsDrawingAlbumsResponseModel,
    errors: [...ERRORS],
  },
  {
    method: "post",
    path: `${BASE}/albums`,
    summary: "Add an album (create); 409 ALBUM_NAME_IN_USE",
    tags: DRAWINGS,
    params: ConstructionProjectsProjectParamsModel,
    body: CreateConstructionProjectsDrawingAlbumRequestModel,
    successStatus: StatusCodes.CREATED,
    successDescription: "The album",
    successSchema: ConstructionProjectsDrawingAlbumResponseModel,
    errors: [...ERRORS, StatusCodes.CONFLICT, StatusCodes.PAYMENT_REQUIRED],
  },
  {
    method: "get",
    path: `${BASE}/albums/{albumId}`,
    summary: "An album and its drawings with their latest revisions (read)",
    tags: DRAWINGS,
    params: ConstructionProjectsDrawingAlbumParamsModel,
    successStatus: StatusCodes.OK,
    successDescription: "The album",
    successSchema: GetConstructionProjectsDrawingAlbumResponseModel,
    errors: [...ERRORS],
  },
  {
    method: "post",
    path: `${BASE}/albums/{albumId}/update`,
    summary:
      "Rename an album (update); 409 ALBUM_CHANGED on a stale updatedAt, ALBUM_NAME_IN_USE",
    tags: DRAWINGS,
    params: ConstructionProjectsDrawingAlbumParamsModel,
    body: UpdateConstructionProjectsDrawingAlbumRequestModel,
    successStatus: StatusCodes.OK,
    successDescription: "The album",
    successSchema: ConstructionProjectsDrawingAlbumResponseModel,
    errors: [...ERRORS, StatusCodes.CONFLICT, StatusCodes.PAYMENT_REQUIRED],
  },
  {
    method: "post",
    path: `${BASE}/albums/{albumId}/delete`,
    summary: "Delete an empty album (delete); 409 ALBUM_NOT_EMPTY",
    tags: DRAWINGS,
    params: ConstructionProjectsDrawingAlbumParamsModel,
    successStatus: StatusCodes.NO_CONTENT,
    successDescription: "Deleted",
    errors: [...ERRORS, StatusCodes.CONFLICT, StatusCodes.PAYMENT_REQUIRED],
  },
  {
    method: "post",
    path: `${BASE}/uploads`,
    summary:
      "Start uploading a drawing or a revision (create or update): PDF, PNG, JPEG, WebP, DWG or DXF up to 100 MB; says where to send the bytes",
    tags: DRAWINGS,
    params: ConstructionProjectsProjectParamsModel,
    body: StartConstructionProjectsDrawingUploadRequestModel,
    successStatus: StatusCodes.CREATED,
    successDescription: "The key and how to upload",
    successSchema: StartConstructionProjectsDrawingUploadResponseModel,
    errors: [...ERRORS, StatusCodes.PAYMENT_REQUIRED],
  },
  {
    method: "post",
    path: `${BASE}/uploads/presign`,
    summary:
      "Deployed only: the `handleUploadUrl` for `uploadPresigned()` (404 with files on disk)",
    tags: DRAWINGS,
    params: ConstructionProjectsProjectParamsModel,
    body: PresignConstructionProjectsDrawingUploadRequestModel,
    successStatus: StatusCodes.OK,
    successDescription: "The presigned URL payload",
    successSchema: PresignConstructionProjectsDrawingUploadResponseModel,
    errors: [...ERRORS, StatusCodes.PAYMENT_REQUIRED],
  },
  {
    method: "post",
    path: `${BASE}/uploads/app`,
    summary:
      "Development and tests only: the raw file, kept at `?key=` (404 when deployed; 409 UPLOAD_EXISTS)",
    tags: DRAWINGS,
    params: ConstructionProjectsProjectParamsModel,
    query: UploadKeyQueryModel,
    bodyBinaryContentTypes: ["application/octet-stream"],
    successStatus: StatusCodes.NO_CONTENT,
    successDescription: "Kept; now finish the upload",
    errors: [...ERRORS, StatusCodes.CONFLICT, StatusCodes.PAYMENT_REQUIRED],
  },
  {
    method: "post",
    path: `${BASE}/uploads/thumbnail`,
    summary:
      "An image's WebP thumbnail (≤ 300 KB) after the file and before finishing",
    tags: DRAWINGS,
    params: ConstructionProjectsProjectParamsModel,
    query: UploadKeyQueryModel,
    bodyBinaryContentTypes: ["image/webp"],
    successStatus: StatusCodes.NO_CONTENT,
    successDescription: "Kept; finishing the upload records it",
    errors: [...ERRORS, StatusCodes.PAYMENT_REQUIRED],
  },
  {
    method: "post",
    path: BASE,
    summary:
      "Finish uploading a new drawing (create): records the file as R1 in the album; 201, or 200 when already recorded",
    tags: DRAWINGS,
    params: ConstructionProjectsProjectParamsModel,
    body: AddConstructionProjectsDrawingRequestModel,
    successStatus: StatusCodes.CREATED,
    successDescription: "The drawing",
    successSchema: GetConstructionProjectsDrawingResponseModel,
    errors: [...ERRORS, StatusCodes.CONFLICT, StatusCodes.PAYMENT_REQUIRED],
  },
  {
    method: "get",
    path: `${BASE}/{drawingId}`,
    summary: "A drawing with its revision history, newest first (read)",
    tags: DRAWINGS,
    params: ConstructionProjectsDrawingParamsModel,
    successStatus: StatusCodes.OK,
    successDescription: "The drawing",
    successSchema: GetConstructionProjectsDrawingResponseModel,
    errors: [...ERRORS],
  },
  {
    method: "post",
    path: `${BASE}/{drawingId}/revisions`,
    summary:
      "Finish uploading a new revision (update): the next R number; 201, or 200 when already recorded",
    tags: DRAWINGS,
    params: ConstructionProjectsDrawingParamsModel,
    body: AddConstructionProjectsDrawingRevisionRequestModel,
    successStatus: StatusCodes.CREATED,
    successDescription: "The drawing with the new revision first",
    successSchema: GetConstructionProjectsDrawingResponseModel,
    errors: [...ERRORS, StatusCodes.CONFLICT, StatusCodes.PAYMENT_REQUIRED],
  },
  {
    method: "post",
    path: `${BASE}/{drawingId}/update`,
    summary: "Rename a drawing (update); 409 DRAWING_CHANGED",
    tags: DRAWINGS,
    params: ConstructionProjectsDrawingParamsModel,
    body: UpdateConstructionProjectsDrawingRequestModel,
    successStatus: StatusCodes.OK,
    successDescription: "The drawing",
    successSchema: GetConstructionProjectsDrawingResponseModel,
    errors: [...ERRORS, StatusCodes.CONFLICT, StatusCodes.PAYMENT_REQUIRED],
  },
  {
    method: "post",
    path: `${BASE}/{drawingId}/move`,
    summary:
      "Move a drawing to another album of the Project (update); 409 DRAWING_CHANGED",
    tags: DRAWINGS,
    params: ConstructionProjectsDrawingParamsModel,
    body: MoveConstructionProjectsDrawingRequestModel,
    successStatus: StatusCodes.OK,
    successDescription: "The drawing",
    successSchema: GetConstructionProjectsDrawingResponseModel,
    errors: [...ERRORS, StatusCodes.CONFLICT, StatusCodes.PAYMENT_REQUIRED],
  },
  {
    method: "post",
    path: `${BASE}/{drawingId}/delete`,
    summary:
      "Delete a drawing and every revision (delete); they leave the Gallery",
    tags: DRAWINGS,
    params: ConstructionProjectsDrawingParamsModel,
    successStatus: StatusCodes.NO_CONTENT,
    successDescription: "Deleted",
    errors: [...ERRORS, StatusCodes.PAYMENT_REQUIRED],
  },
  {
    method: "get",
    path: `${BASE}/{drawingId}/revisions/{revisionId}/file`,
    summary:
      "Stream a revision (read): PDFs and images are shown, DWG and DXF download; `?download=1` always downloads",
    tags: DRAWINGS,
    params: ConstructionProjectsDrawingRevisionParamsModel,
    query: FileDownloadQueryModel,
    successStatus: StatusCodes.OK,
    successDescription: "The file",
    successBinaryContentTypes: FILE_CONTENT_TYPES,
    errors: [...ERRORS],
  },
  {
    method: "get",
    path: `${BASE}/{drawingId}/revisions/{revisionId}/thumbnail`,
    summary:
      "An image revision's WebP thumbnail (read); 404 THUMBNAIL_NOT_FOUND",
    tags: DRAWINGS,
    params: ConstructionProjectsDrawingRevisionParamsModel,
    successStatus: StatusCodes.OK,
    successDescription: "The thumbnail",
    successBinaryContentTypes: ["image/webp"],
    errors: [...ERRORS],
  },
];
