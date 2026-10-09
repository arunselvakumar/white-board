import { z } from "zod";

import {
  PROJECT_DOCUMENT_KINDS,
  PROJECT_DOCUMENT_MAX_BYTES,
  PROJECT_DOCUMENTS_MAX,
} from "@/src/projects/domain/project-document-rules";

export const projectDocumentKindModel = z
  .enum(PROJECT_DOCUMENT_KINDS)
  .describe(
    "Which paper the file is a copy of: tender, quotation, loa, client_order (the PO / WO), agreement or other.",
  );

export const ConstructionProjectsDocumentParamsModel = z.object({
  id: z.uuid(),
  docId: z.uuid(),
});

export const ConstructionProjectsDocumentResponseModel = z.object({
  id: z.uuid(),
  kind: projectDocumentKindModel,
  fileName: z.string(),
  contentType: z
    .string()
    .describe(
      "What the file is by its content: application/pdf, image/png, image/jpeg, image/webp, or application/octet-stream for anything else.",
    ),
  bytes: z.int(),
  viewable: z
    .boolean()
    .describe(
      "A PDF or an image, which `url` shows in the browser; anything else always downloads.",
    ),
  url: z
    .string()
    .describe("Our route that streams the file; add `?download=1` to save it."),
  createdAt: z.iso.datetime(),
  createdBy: z.string().describe("User id of the uploader."),
  createdByName: z
    .string()
    .nullable()
    .describe("The uploader's Team Member name, when still known."),
});

export type ConstructionProjectsDocumentResponseModel = z.infer<
  typeof ConstructionProjectsDocumentResponseModel
>;

export const ListConstructionProjectsDocumentsResponseModel = z.object({
  items: z
    .array(ConstructionProjectsDocumentResponseModel)
    .describe("Newest first."),
  totalBytes: z.int(),
});

export type ListConstructionProjectsDocumentsResponseModel = z.infer<
  typeof ListConstructionProjectsDocumentsResponseModel
>;

/**
 * Step 1 of an upload: say what is coming. The server checks the name,
 * size, count and plan before any byte moves.
 */
export const StartConstructionProjectsDocumentUploadRequestModel = z.object({
  kind: projectDocumentKindModel,
  fileName: z
    .string()
    .min(1)
    .max(255)
    .describe(
      "The file's name; 400 FILE_TYPE_NOT_ALLOWED for a program, script or shortcut (`BLOCKED_DOCUMENT_EXTENSIONS`: .exe, .msi, .bat, .ps1, .js, .hta, .lnk, .reg and the like).",
    ),
  bytes: z
    .int()
    .positive()
    .describe(
      `Size in bytes; 400 FILE_TOO_LARGE above ${String(PROJECT_DOCUMENT_MAX_BYTES)}. 409 DOCUMENTS_LIMIT at ${String(PROJECT_DOCUMENTS_MAX)} files; 402 PLAN_LIMIT_EXCEEDED past the plan's storage.`,
    ),
});

export type StartConstructionProjectsDocumentUploadRequestModel = z.infer<
  typeof StartConstructionProjectsDocumentUploadRequestModel
>;

export const StartConstructionProjectsDocumentUploadResponseModel = z.object({
  key: z
    .string()
    .describe("Where the file goes; send it back to finish the upload."),
  fileName: z.string().describe("The name as it will be shown."),
  upload: z.discriminatedUnion("via", [
    z
      .object({
        via: z.literal("blob"),
        handleUploadUrl: z.string(),
        multipart: z.boolean(),
      })
      .describe(
        "Deployed: the browser sends the file straight to private storage with `uploadPresigned(key, file, { access: 'private', handleUploadUrl, multipart })` from `@vercel/blob/client`.",
      ),
    z
      .object({ via: z.literal("app"), url: z.string() })
      .describe(
        "Development and tests: POST the raw file to `url` with its content-type.",
      ),
  ]),
});

export type StartConstructionProjectsDocumentUploadResponseModel = z.infer<
  typeof StartConstructionProjectsDocumentUploadResponseModel
>;

/** Step 3: the bytes are in storage; record the document. */
export const AddConstructionProjectsDocumentRequestModel = z.object({
  key: z.string().describe("The `key` from step 1."),
  kind: projectDocumentKindModel,
  fileName: z.string().min(1).max(255),
});

export type AddConstructionProjectsDocumentRequestModel = z.infer<
  typeof AddConstructionProjectsDocumentRequestModel
>;
