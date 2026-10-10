import { z } from "zod";

import { MEDIA_SOURCES } from "@/src/projects/domain/media-item";

const calendarDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .describe("A calendar date, YYYY-MM-DD, in the Company time zone.");

export const ListConstructionProjectsGalleryQueryModel = z
  .object({
    type: z
      .enum(["image", "pdf"])
      .optional()
      .describe("Images (PNG, JPEG, WebP) or PDFs only."),
    source: z
      .string()
      .trim()
      .min(1)
      .max(40)
      .optional()
      .describe(
        `Where the file is kept: ${MEDIA_SOURCES.join(", ")} in M4; later modules add theirs (worksheet, issue, inspection …), so any value is accepted.`,
      ),
    uploadedBy: z
      .string()
      .min(1)
      .max(100)
      .optional()
      .describe("A User id from `gallery/uploaders`."),
    from: calendarDate.optional().describe("Uploaded on or after this day."),
    to: calendarDate.optional().describe("Uploaded on or before this day."),
    q: z
      .string()
      .trim()
      .max(100)
      .optional()
      .describe("Part of the file name, ignoring case."),
    limit: z.coerce.number().int().min(1).max(100).optional().default(48),
    after: z.string().min(1).optional().describe("`nextCursor`: older files."),
    before: z.string().min(1).optional().describe("`prevCursor`: newer files."),
  })
  .refine((value) => value.after == null || value.before == null, {
    message: "after and before are mutually exclusive.",
    path: ["after"],
  });

export type ListConstructionProjectsGalleryQueryModel = z.infer<
  typeof ListConstructionProjectsGalleryQueryModel
>;

export const ConstructionProjectsGalleryItemResponseModel = z.object({
  id: z.uuid(),
  type: z.enum(["image", "pdf"]),
  source: z
    .string()
    .describe(`${MEDIA_SOURCES.join(", ")}; more sources in later modules.`),
  sourceId: z.uuid().describe("The document, drawing or testing report."),
  fileName: z.string(),
  contentType: z.string(),
  bytes: z.int(),
  fileUrl: z
    .string()
    .describe(
      "The source's own file route (documents, drawings, testing reports), which checks the source's Read flag again: without it the route answers 403, and for a Project the member is not on, 404. The Gallery itself serves no file.",
    ),
  thumbUrl: z
    .string()
    .nullable()
    .describe(
      "The source's thumbnail route for an image that has one; otherwise null — show the image at `fileUrl`, or a file icon for a PDF.",
    ),
  uploadedBy: z.string(),
  uploadedByName: z.string().nullable(),
  uploadedAt: z.iso.datetime(),
});

export type ConstructionProjectsGalleryItemResponseModel = z.infer<
  typeof ConstructionProjectsGalleryItemResponseModel
>;

export const ListConstructionProjectsGalleryResponseModel = z.object({
  items: z
    .array(ConstructionProjectsGalleryItemResponseModel)
    .describe(
      "Newest upload first. Only files whose source menu the viewer may read are listed.",
    ),
  nextCursor: z.string().nullable(),
  prevCursor: z.string().nullable(),
  total: z.int().describe("Files matching the filters."),
});

export type ListConstructionProjectsGalleryResponseModel = z.infer<
  typeof ListConstructionProjectsGalleryResponseModel
>;

export const ListConstructionProjectsGalleryUploadersResponseModel = z.object({
  items: z
    .array(
      z.object({
        userId: z.string(),
        name: z
          .string()
          .nullable()
          .describe("The Team Member's name, when still known."),
      }),
    )
    .describe("By name: everyone who uploaded a file the viewer can see."),
});

export type ListConstructionProjectsGalleryUploadersResponseModel = z.infer<
  typeof ListConstructionProjectsGalleryUploadersResponseModel
>;
