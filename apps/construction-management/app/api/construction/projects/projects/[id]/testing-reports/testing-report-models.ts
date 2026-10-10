import { z } from "zod";

import { startUploadResponseModel } from "@/app/api/_lib/attachments";
import { TESTING_REPORT_MAX_BYTES } from "@/src/projects/domain/project-upload-policies";
import {
  TESTING_ITEM_NAME_MAX,
  TESTING_REPORT_NAME_MAX,
  TESTING_REPORT_REMARK_MAX,
} from "@/src/projects/domain/testing-report";

export const ConstructionProjectsTestingItemParamsModel = z.object({
  id: z.uuid(),
  itemId: z.uuid(),
});

export const ConstructionProjectsTestingReportParamsModel = z.object({
  id: z.uuid(),
  reportId: z.uuid(),
});

const calendarDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .describe("A calendar date, YYYY-MM-DD, in the Company time zone.");

export const ConstructionProjectsTestingItemResponseModel = z.object({
  id: z.uuid(),
  name: z.string(),
  isSeed: z
    .boolean()
    .describe(
      "One of the items every Project starts with: Rcc cube, Steel, Cement, Bricks.",
    ),
  reportCount: z.int(),
  updatedAt: z.iso.datetime(),
});

export type ConstructionProjectsTestingItemResponseModel = z.infer<
  typeof ConstructionProjectsTestingItemResponseModel
>;

export const ListConstructionProjectsTestingItemsResponseModel = z.object({
  items: z
    .array(ConstructionProjectsTestingItemResponseModel)
    .describe("By name."),
});

export type ListConstructionProjectsTestingItemsResponseModel = z.infer<
  typeof ListConstructionProjectsTestingItemsResponseModel
>;

export const CreateConstructionProjectsTestingItemRequestModel = z.object({
  name: z
    .string()
    .max(200)
    .describe(
      `The testing material name; at most ${String(TESTING_ITEM_NAME_MAX)} characters, unique in the Project ignoring case (409 TESTING_ITEM_NAME_IN_USE).`,
    ),
});

export type CreateConstructionProjectsTestingItemRequestModel = z.infer<
  typeof CreateConstructionProjectsTestingItemRequestModel
>;

export const UpdateConstructionProjectsTestingItemRequestModel =
  CreateConstructionProjectsTestingItemRequestModel.extend({
    updatedAt: z.iso
      .datetime()
      .describe(
        "The `updatedAt` you loaded; 409 TESTING_ITEM_CHANGED when stale.",
      ),
  });

export type UpdateConstructionProjectsTestingItemRequestModel = z.infer<
  typeof UpdateConstructionProjectsTestingItemRequestModel
>;

export const ConstructionProjectsTestingReportResponseModel = z.object({
  id: z.uuid(),
  itemId: z.uuid(),
  name: z.string(),
  reportDate: calendarDate,
  remark: z.string().nullable(),
  fileName: z.string(),
  contentType: z.string().describe("application/pdf or an image type."),
  bytes: z.int(),
  viewable: z.boolean(),
  url: z
    .string()
    .describe("Our route that streams the file; add `?download=1` to save it."),
  thumbUrl: z
    .string()
    .nullable()
    .describe("The image's WebP thumbnail, or null when none was made."),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  createdBy: z.string(),
  createdByName: z.string().nullable(),
});

export type ConstructionProjectsTestingReportResponseModel = z.infer<
  typeof ConstructionProjectsTestingReportResponseModel
>;

export const ListConstructionProjectsTestingReportsQueryModel = z
  .object({
    q: z
      .string()
      .trim()
      .max(100)
      .optional()
      .describe("Part of the report name, ignoring case."),
    limit: z.coerce.number().int().min(1).max(100).optional().default(25),
    after: z
      .string()
      .min(1)
      .optional()
      .describe("`nextCursor`: older reports."),
    before: z
      .string()
      .min(1)
      .optional()
      .describe("`prevCursor`: newer reports."),
  })
  .refine((value) => value.after == null || value.before == null, {
    message: "after and before are mutually exclusive.",
    path: ["after"],
  });

export const ListConstructionProjectsTestingReportsResponseModel = z.object({
  item: ConstructionProjectsTestingItemResponseModel,
  items: z
    .array(ConstructionProjectsTestingReportResponseModel)
    .describe("Newest report date first."),
  nextCursor: z.string().nullable(),
  prevCursor: z.string().nullable(),
  total: z.int().describe("Reports matching `q` on the item."),
});

export type ListConstructionProjectsTestingReportsResponseModel = z.infer<
  typeof ListConstructionProjectsTestingReportsResponseModel
>;

const details = {
  name: z
    .string()
    .max(300)
    .describe(`At most ${String(TESTING_REPORT_NAME_MAX)} characters.`),
  reportDate: calendarDate.describe(
    "The report date; 403 BACKDATED_CREATE_BLOCKED / BACKDATED_EDIT_BLOCKED / FINANCIAL_PERIOD_CLOSED under the back-dated policy for Material Testing Report.",
  ),
  remark: z
    .string()
    .max(1000)
    .nullish()
    .describe(
      `Optional; at most ${String(TESTING_REPORT_REMARK_MAX)} characters.`,
    ),
};

const uploadedFile = z.object({
  key: z.string().describe("The `key` from starting the upload."),
  fileName: z.string().min(1).max(255),
});

export const CreateConstructionProjectsTestingReportRequestModel = z.object({
  ...details,
  ...uploadedFile.shape,
});

export type CreateConstructionProjectsTestingReportRequestModel = z.infer<
  typeof CreateConstructionProjectsTestingReportRequestModel
>;

export const UpdateConstructionProjectsTestingReportRequestModel = z.object({
  ...details,
  updatedAt: z.iso
    .datetime()
    .describe(
      "The `updatedAt` you loaded; 409 TESTING_REPORT_CHANGED when stale.",
    ),
  file: uploadedFile
    .nullish()
    .describe("A new file to replace the report's; left out keeps the file."),
});

export type UpdateConstructionProjectsTestingReportRequestModel = z.infer<
  typeof UpdateConstructionProjectsTestingReportRequestModel
>;

export const StartConstructionProjectsTestingReportUploadRequestModel =
  z.object({
    fileName: z
      .string()
      .min(1)
      .max(255)
      .describe(
        "A .pdf, .png, .jpg, .jpeg or .webp; 400 FILE_TYPE_NOT_ALLOWED otherwise.",
      ),
    bytes: z
      .int()
      .positive()
      .describe(
        `Size in bytes; 400 FILE_TOO_LARGE above ${String(TESTING_REPORT_MAX_BYTES)}; 402 PLAN_LIMIT_EXCEEDED past the plan's storage.`,
      ),
  });

export const StartConstructionProjectsTestingReportUploadResponseModel =
  startUploadResponseModel();
