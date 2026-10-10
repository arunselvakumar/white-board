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
  ConstructionProjectsTestingItemParamsModel,
  ConstructionProjectsTestingItemResponseModel,
  ConstructionProjectsTestingReportParamsModel,
  ConstructionProjectsTestingReportResponseModel,
  CreateConstructionProjectsTestingItemRequestModel,
  CreateConstructionProjectsTestingReportRequestModel,
  ListConstructionProjectsTestingItemsResponseModel,
  ListConstructionProjectsTestingReportsQueryModel,
  ListConstructionProjectsTestingReportsResponseModel,
  StartConstructionProjectsTestingReportUploadRequestModel,
  StartConstructionProjectsTestingReportUploadResponseModel,
  UpdateConstructionProjectsTestingItemRequestModel,
  UpdateConstructionProjectsTestingReportRequestModel,
} from "./testing-report-models";

const PROJECTS = ["Construction · Projects"];

const BASE = "/api/construction/projects/projects/{id}/testing-reports";

const ERRORS = [
  StatusCodes.BAD_REQUEST,
  StatusCodes.UNAUTHORIZED,
  StatusCodes.FORBIDDEN,
  StatusCodes.NOT_FOUND,
] as const;

const PresignConstructionProjectsTestingReportUploadRequestModel =
  presignUploadRequestModel();
const PresignConstructionProjectsTestingReportUploadResponseModel =
  presignUploadResponseModel();

/** Testing Reports' models (CM-409). */
export const testingReportOpenApiComponents: OpenApiComponents = {
  ConstructionProjectsTestingItemResponseModel,
  ListConstructionProjectsTestingItemsResponseModel,
  CreateConstructionProjectsTestingItemRequestModel,
  UpdateConstructionProjectsTestingItemRequestModel,
  ConstructionProjectsTestingReportResponseModel,
  ListConstructionProjectsTestingReportsResponseModel,
  CreateConstructionProjectsTestingReportRequestModel,
  UpdateConstructionProjectsTestingReportRequestModel,
  StartConstructionProjectsTestingReportUploadRequestModel,
  StartConstructionProjectsTestingReportUploadResponseModel,
  PresignConstructionProjectsTestingReportUploadRequestModel,
  PresignConstructionProjectsTestingReportUploadResponseModel,
};

/** Testing Reports' routes (CM-409), under `projects.testing_reports`. */
export const testingReportOpenApiOperations: OpenApiOperation[] = [
  {
    method: "get",
    path: `${BASE}/items`,
    summary: "The Project's testing items by name, with report counts (read)",
    tags: PROJECTS,
    params: ConstructionProjectsProjectParamsModel,
    successStatus: StatusCodes.OK,
    successDescription: "Testing items",
    successSchema: ListConstructionProjectsTestingItemsResponseModel,
    errors: [...ERRORS],
  },
  {
    method: "post",
    path: `${BASE}/items`,
    summary: "Add a testing item (create); 409 TESTING_ITEM_NAME_IN_USE",
    tags: PROJECTS,
    params: ConstructionProjectsProjectParamsModel,
    body: CreateConstructionProjectsTestingItemRequestModel,
    successStatus: StatusCodes.CREATED,
    successDescription: "The testing item",
    successSchema: ConstructionProjectsTestingItemResponseModel,
    errors: [...ERRORS, StatusCodes.CONFLICT, StatusCodes.PAYMENT_REQUIRED],
  },
  {
    method: "post",
    path: `${BASE}/items/{itemId}/update`,
    summary:
      "Rename a testing item (update); 409 TESTING_ITEM_CHANGED, TESTING_ITEM_NAME_IN_USE",
    tags: PROJECTS,
    params: ConstructionProjectsTestingItemParamsModel,
    body: UpdateConstructionProjectsTestingItemRequestModel,
    successStatus: StatusCodes.OK,
    successDescription: "The testing item",
    successSchema: ConstructionProjectsTestingItemResponseModel,
    errors: [...ERRORS, StatusCodes.CONFLICT, StatusCodes.PAYMENT_REQUIRED],
  },
  {
    method: "post",
    path: `${BASE}/items/{itemId}/delete`,
    summary:
      "Delete a testing item with no reports (delete); 409 TESTING_ITEM_NOT_EMPTY",
    tags: PROJECTS,
    params: ConstructionProjectsTestingItemParamsModel,
    successStatus: StatusCodes.NO_CONTENT,
    successDescription: "Deleted",
    errors: [...ERRORS, StatusCodes.CONFLICT, StatusCodes.PAYMENT_REQUIRED],
  },
  {
    method: "get",
    path: `${BASE}/items/{itemId}/reports`,
    summary:
      "An item's reports, newest report date first, searched by name, with cursors and the total (read)",
    tags: PROJECTS,
    params: ConstructionProjectsTestingItemParamsModel,
    query: ListConstructionProjectsTestingReportsQueryModel,
    successStatus: StatusCodes.OK,
    successDescription: "A page of reports",
    successSchema: ListConstructionProjectsTestingReportsResponseModel,
    errors: [...ERRORS],
  },
  {
    method: "post",
    path: `${BASE}/items/{itemId}/reports`,
    summary:
      "Finish adding a report (create): details and the uploaded file; 201, or 200 when already recorded. 403 BACKDATED_CREATE_BLOCKED / FINANCIAL_PERIOD_CLOSED",
    tags: PROJECTS,
    params: ConstructionProjectsTestingItemParamsModel,
    body: CreateConstructionProjectsTestingReportRequestModel,
    successStatus: StatusCodes.CREATED,
    successDescription: "The report",
    successSchema: ConstructionProjectsTestingReportResponseModel,
    errors: [...ERRORS, StatusCodes.CONFLICT, StatusCodes.PAYMENT_REQUIRED],
  },
  {
    method: "post",
    path: `${BASE}/uploads`,
    summary:
      "Start uploading a report's file (create or update): a PDF or image up to 25 MB",
    tags: PROJECTS,
    params: ConstructionProjectsProjectParamsModel,
    body: StartConstructionProjectsTestingReportUploadRequestModel,
    successStatus: StatusCodes.CREATED,
    successDescription: "The key and how to upload",
    successSchema: StartConstructionProjectsTestingReportUploadResponseModel,
    errors: [...ERRORS, StatusCodes.PAYMENT_REQUIRED],
  },
  {
    method: "post",
    path: `${BASE}/uploads/presign`,
    summary:
      "Deployed only: the `handleUploadUrl` for `uploadPresigned()` (404 with files on disk)",
    tags: PROJECTS,
    params: ConstructionProjectsProjectParamsModel,
    body: PresignConstructionProjectsTestingReportUploadRequestModel,
    successStatus: StatusCodes.OK,
    successDescription: "The presigned URL payload",
    successSchema: PresignConstructionProjectsTestingReportUploadResponseModel,
    errors: [...ERRORS, StatusCodes.PAYMENT_REQUIRED],
  },
  {
    method: "post",
    path: `${BASE}/uploads/app`,
    summary:
      "Development and tests only: the raw file, kept at `?key=` (404 when deployed; 409 UPLOAD_EXISTS)",
    tags: PROJECTS,
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
    tags: PROJECTS,
    params: ConstructionProjectsProjectParamsModel,
    query: UploadKeyQueryModel,
    bodyBinaryContentTypes: ["image/webp"],
    successStatus: StatusCodes.NO_CONTENT,
    successDescription: "Kept; finishing the upload records it",
    errors: [...ERRORS, StatusCodes.PAYMENT_REQUIRED],
  },
  {
    method: "get",
    path: `${BASE}/reports/{reportId}`,
    summary: "One testing report (read)",
    tags: PROJECTS,
    params: ConstructionProjectsTestingReportParamsModel,
    successStatus: StatusCodes.OK,
    successDescription: "The report",
    successSchema: ConstructionProjectsTestingReportResponseModel,
    errors: [...ERRORS],
  },
  {
    method: "post",
    path: `${BASE}/reports/{reportId}/update`,
    summary:
      "Edit a report and optionally replace its file (update); 409 TESTING_REPORT_CHANGED; 403 BACKDATED_EDIT_BLOCKED",
    tags: PROJECTS,
    params: ConstructionProjectsTestingReportParamsModel,
    body: UpdateConstructionProjectsTestingReportRequestModel,
    successStatus: StatusCodes.OK,
    successDescription: "The report",
    successSchema: ConstructionProjectsTestingReportResponseModel,
    errors: [...ERRORS, StatusCodes.CONFLICT, StatusCodes.PAYMENT_REQUIRED],
  },
  {
    method: "post",
    path: `${BASE}/reports/{reportId}/delete`,
    summary:
      "Delete a report (delete; back-dated edit check); it leaves the Gallery",
    tags: PROJECTS,
    params: ConstructionProjectsTestingReportParamsModel,
    successStatus: StatusCodes.NO_CONTENT,
    successDescription: "Deleted",
    errors: [...ERRORS, StatusCodes.PAYMENT_REQUIRED],
  },
  {
    method: "get",
    path: `${BASE}/reports/{reportId}/file`,
    summary:
      "Stream a report's file (read), shown in the browser; `?download=1` saves it",
    tags: PROJECTS,
    params: ConstructionProjectsTestingReportParamsModel,
    query: FileDownloadQueryModel,
    successStatus: StatusCodes.OK,
    successDescription: "The file",
    successBinaryContentTypes: FILE_CONTENT_TYPES,
    errors: [...ERRORS],
  },
  {
    method: "get",
    path: `${BASE}/reports/{reportId}/thumbnail`,
    summary: "A report image's WebP thumbnail (read); 404 THUMBNAIL_NOT_FOUND",
    tags: PROJECTS,
    params: ConstructionProjectsTestingReportParamsModel,
    successStatus: StatusCodes.OK,
    successDescription: "The thumbnail",
    successBinaryContentTypes: ["image/webp"],
    errors: [...ERRORS],
  },
];
