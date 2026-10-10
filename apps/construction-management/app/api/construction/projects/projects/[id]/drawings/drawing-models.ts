import { z } from "zod";

import { startUploadResponseModel } from "@/app/api/_lib/attachments";
import {
  ALBUM_NAME_MAX,
  DRAWING_NAME_MAX,
} from "@/src/projects/domain/drawing";
import { DRAWING_MAX_BYTES } from "@/src/projects/domain/project-upload-policies";

export const ConstructionProjectsDrawingAlbumParamsModel = z.object({
  id: z.uuid(),
  albumId: z.uuid(),
});

export const ConstructionProjectsDrawingParamsModel = z.object({
  id: z.uuid(),
  drawingId: z.uuid(),
});

export const ConstructionProjectsDrawingRevisionParamsModel = z.object({
  id: z.uuid(),
  drawingId: z.uuid(),
  revisionId: z.uuid(),
});

const updatedAt = z.iso
  .datetime()
  .describe(
    "The `updatedAt` you loaded; 409 when someone saved in between (ALBUM_CHANGED / DRAWING_CHANGED).",
  );

export const ConstructionProjectsDrawingAlbumResponseModel = z.object({
  id: z.uuid(),
  name: z.string(),
  isSeed: z
    .boolean()
    .describe(
      "One of the albums every Project starts with: Architect, Electrical, Plumbing, Structural Drawing.",
    ),
  drawingCount: z.int(),
  updatedAt: z.iso.datetime(),
});

export type ConstructionProjectsDrawingAlbumResponseModel = z.infer<
  typeof ConstructionProjectsDrawingAlbumResponseModel
>;

export const ListConstructionProjectsDrawingAlbumsResponseModel = z.object({
  items: z
    .array(ConstructionProjectsDrawingAlbumResponseModel)
    .describe("By name."),
});

export type ListConstructionProjectsDrawingAlbumsResponseModel = z.infer<
  typeof ListConstructionProjectsDrawingAlbumsResponseModel
>;

export const CreateConstructionProjectsDrawingAlbumRequestModel = z.object({
  name: z
    .string()
    .max(200)
    .describe(
      `At most ${String(ALBUM_NAME_MAX)} characters; unique in the Project ignoring case (409 ALBUM_NAME_IN_USE).`,
    ),
});

export type CreateConstructionProjectsDrawingAlbumRequestModel = z.infer<
  typeof CreateConstructionProjectsDrawingAlbumRequestModel
>;

export const UpdateConstructionProjectsDrawingAlbumRequestModel =
  CreateConstructionProjectsDrawingAlbumRequestModel.extend({ updatedAt });

export type UpdateConstructionProjectsDrawingAlbumRequestModel = z.infer<
  typeof UpdateConstructionProjectsDrawingAlbumRequestModel
>;

export const ConstructionProjectsDrawingRevisionResponseModel = z.object({
  id: z.uuid(),
  revision: z.int().describe("1, 2, 3 …"),
  label: z.string().describe("R1, R2, R3 …"),
  fileName: z.string(),
  contentType: z
    .string()
    .describe(
      "application/pdf or an image type, shown in the viewer; application/octet-stream for DWG and DXF, which only download.",
    ),
  bytes: z.int(),
  viewable: z.boolean().describe("A PDF or an image."),
  url: z
    .string()
    .describe("Our route that streams the file; add `?download=1` to save it."),
  thumbUrl: z
    .string()
    .nullable()
    .describe("The image's WebP thumbnail, or null when none was made."),
  createdAt: z.iso.datetime(),
  createdBy: z.string().describe("User id of the uploader."),
  createdByName: z.string().nullable(),
});

export type ConstructionProjectsDrawingRevisionResponseModel = z.infer<
  typeof ConstructionProjectsDrawingRevisionResponseModel
>;

export const ConstructionProjectsDrawingResponseModel = z.object({
  id: z.uuid(),
  albumId: z.uuid(),
  name: z.string(),
  revisionCount: z.int(),
  latest: ConstructionProjectsDrawingRevisionResponseModel.describe(
    "The revision shown.",
  ),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export type ConstructionProjectsDrawingResponseModel = z.infer<
  typeof ConstructionProjectsDrawingResponseModel
>;

export const GetConstructionProjectsDrawingAlbumResponseModel = z.object({
  album: ConstructionProjectsDrawingAlbumResponseModel,
  drawings: z
    .array(ConstructionProjectsDrawingResponseModel)
    .describe("Most recently changed first."),
});

export type GetConstructionProjectsDrawingAlbumResponseModel = z.infer<
  typeof GetConstructionProjectsDrawingAlbumResponseModel
>;

export const GetConstructionProjectsDrawingResponseModel = z.object({
  id: z.uuid(),
  albumId: z.uuid(),
  albumName: z.string(),
  name: z.string(),
  revisions: z
    .array(ConstructionProjectsDrawingRevisionResponseModel)
    .describe("Newest first; the first is the one shown."),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export type GetConstructionProjectsDrawingResponseModel = z.infer<
  typeof GetConstructionProjectsDrawingResponseModel
>;

export const StartConstructionProjectsDrawingUploadRequestModel = z.object({
  fileName: z
    .string()
    .min(1)
    .max(255)
    .describe(
      "A .pdf, .png, .jpg, .jpeg, .webp, .dwg or .dxf; 400 FILE_TYPE_NOT_ALLOWED otherwise or for a program.",
    ),
  bytes: z
    .int()
    .positive()
    .describe(
      `Size in bytes; 400 FILE_TOO_LARGE above ${String(DRAWING_MAX_BYTES)}; 402 PLAN_LIMIT_EXCEEDED past the plan's storage.`,
    ),
});

export type StartConstructionProjectsDrawingUploadRequestModel = z.infer<
  typeof StartConstructionProjectsDrawingUploadRequestModel
>;

export const StartConstructionProjectsDrawingUploadResponseModel =
  startUploadResponseModel();

const uploadedFile = {
  key: z.string().describe("The `key` from starting the upload."),
  fileName: z.string().min(1).max(255),
};

export const AddConstructionProjectsDrawingRequestModel = z.object({
  ...uploadedFile,
  albumId: z.uuid(),
  name: z
    .string()
    .max(200)
    .nullish()
    .describe(
      `At most ${String(DRAWING_NAME_MAX)} characters; left out or blank, the file name without its extension.`,
    ),
});

export type AddConstructionProjectsDrawingRequestModel = z.infer<
  typeof AddConstructionProjectsDrawingRequestModel
>;

export const AddConstructionProjectsDrawingRevisionRequestModel =
  z.object(uploadedFile);

export type AddConstructionProjectsDrawingRevisionRequestModel = z.infer<
  typeof AddConstructionProjectsDrawingRevisionRequestModel
>;

export const UpdateConstructionProjectsDrawingRequestModel = z.object({
  name: z
    .string()
    .max(200)
    .describe(`At most ${String(DRAWING_NAME_MAX)} characters.`),
  updatedAt,
});

export type UpdateConstructionProjectsDrawingRequestModel = z.infer<
  typeof UpdateConstructionProjectsDrawingRequestModel
>;

export const MoveConstructionProjectsDrawingRequestModel = z.object({
  albumId: z.uuid().describe("Another album of the same Project."),
  updatedAt,
});

export type MoveConstructionProjectsDrawingRequestModel = z.infer<
  typeof MoveConstructionProjectsDrawingRequestModel
>;
