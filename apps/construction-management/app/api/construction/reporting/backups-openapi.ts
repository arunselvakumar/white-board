import { StatusCodes } from "http-status-codes";

import type {
  OpenApiComponents,
  OpenApiOperation,
} from "@/app/api/_lib/openapi";

import {
  BACKUPS_PATH,
  ConstructionReportingBackupModuleModel,
  ConstructionReportingBackupParamsModel,
  ConstructionReportingBackupResponseModel,
  CreateConstructionReportingBackupRequestModel,
  DownloadConstructionReportingBackupRequestModel,
  ListConstructionReportingBackupOptionsRequestModel,
  ListConstructionReportingBackupOptionsResponseModel,
  ListConstructionReportingBackupsRequestModel,
  ListConstructionReportingBackupsResponseModel,
} from "./backups/backup-models";

const REPORTING = ["Construction · Reporting"];

/** Backups and Download My Data (CM-906, ADR CM-0021 §8). */
export const reportingBackupsOpenApiComponents: OpenApiComponents = {
  CreateConstructionReportingBackupRequestModel,
  ConstructionReportingBackupResponseModel,
  ListConstructionReportingBackupsResponseModel,
  ConstructionReportingBackupModuleModel,
  ListConstructionReportingBackupOptionsResponseModel,
};

export const reportingBackupsOpenApiOperations: OpenApiOperation[] = [
  {
    method: "post",
    path: BACKUPS_PATH,
    summary:
      "Ask for a backup: a Project's chosen modules (Project View and View on each module; amounts with each module's money right), master records (View on each), the full Company (Owner only, with a `company_backup` code; the link is emailed) or Download My Data (any signed-in User). Queued as one part per module and a zip step; allowed after the plan has ended",
    tags: REPORTING,
    body: CreateConstructionReportingBackupRequestModel,
    successStatus: StatusCodes.CREATED,
    successDescription: "The queued backup",
    successSchema: ConstructionReportingBackupResponseModel,
    errors: [
      StatusCodes.BAD_REQUEST,
      StatusCodes.UNAUTHORIZED,
      StatusCodes.FORBIDDEN,
      StatusCodes.NOT_FOUND,
      StatusCodes.CONFLICT,
      StatusCodes.TOO_MANY_REQUESTS,
    ],
  },
  {
    method: "get",
    path: BACKUPS_PATH,
    summary:
      "Your own backups in the Active Company and your data exports, newest first, with the signed 7-day download link while done",
    tags: REPORTING,
    query: ListConstructionReportingBackupsRequestModel,
    successStatus: StatusCodes.OK,
    successDescription: "A page of backups and the next page's cursor",
    successSchema: ListConstructionReportingBackupsResponseModel,
    errors: [StatusCodes.BAD_REQUEST, StatusCodes.UNAUTHORIZED],
  },
  {
    method: "get",
    path: `${BACKUPS_PATH}/options`,
    summary:
      "The modules the backup dialog offers you on a Project (scope=project&projectId=) or for master records (scope=masters), with whether each would carry amounts",
    tags: REPORTING,
    query: ListConstructionReportingBackupOptionsRequestModel,
    successStatus: StatusCodes.OK,
    successDescription: "Modules in dialog order",
    successSchema: ListConstructionReportingBackupOptionsResponseModel,
    errors: [StatusCodes.BAD_REQUEST, StatusCodes.UNAUTHORIZED],
  },
  {
    method: "get",
    path: `${BACKUPS_PATH}/{id}`,
    summary: "One of your own backups or data exports",
    tags: REPORTING,
    params: ConstructionReportingBackupParamsModel,
    successStatus: StatusCodes.OK,
    successDescription: "The backup",
    successSchema: ConstructionReportingBackupResponseModel,
    errors: [StatusCodes.UNAUTHORIZED, StatusCodes.NOT_FOUND],
  },
  {
    method: "get",
    path: `${BACKUPS_PATH}/{id}/download`,
    summary:
      "Download a finished backup's ZIP through its signed link: 403 BACKUP_LINK_INVALID for a tampered link or another User, 410 BACKUP_LINK_EXPIRED after 7 days, 409 BACKUP_NOT_READY while it is being made",
    tags: REPORTING,
    params: ConstructionReportingBackupParamsModel,
    query: DownloadConstructionReportingBackupRequestModel,
    successStatus: StatusCodes.OK,
    successDescription: "The ZIP",
    successBinaryContentTypes: ["application/zip"],
    errors: [
      StatusCodes.UNAUTHORIZED,
      StatusCodes.FORBIDDEN,
      StatusCodes.NOT_FOUND,
      StatusCodes.CONFLICT,
      StatusCodes.GONE,
    ],
  },
  {
    method: "post",
    path: `${BACKUPS_PATH}/{id}/delete`,
    summary: "Delete one of your own backups or data exports and its file",
    tags: REPORTING,
    params: ConstructionReportingBackupParamsModel,
    successStatus: StatusCodes.NO_CONTENT,
    successDescription: "Deleted",
    errors: [StatusCodes.UNAUTHORIZED, StatusCodes.NOT_FOUND],
  },
];
